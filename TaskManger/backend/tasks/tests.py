from datetime import timedelta, datetime
from zoneinfo import ZoneInfo
from unittest.mock import patch, AsyncMock
from django.test import TestCase, TransactionTestCase, override_settings
from django.core import mail, signing
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from categories.models import Category
from tasks.models import Task
from notifications.models import Reminder, Notification
from notifications.jobs import deliver
from channels.testing import WebsocketCommunicator
from config.asgi import application
from asgiref.sync import async_to_sync


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class APITests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.test", password="Strong-Example-42!"
        )
        self.other = User.objects.create_user(
            username="other", email="other@example.test", password="Strong-Example-42!"
        )
        self.client.force_authenticate(self.user)

    def create(self, **kwargs):
        response = self.client.post(
            "/api/tasks/",
            {
                "title": "Study",
                "due": (timezone.now() + timedelta(hours=1)).isoformat(),
                **kwargs,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_register_login_logout_and_defaults(self):
        self.client.force_authenticate(None)
        r = self.client.post(
            "/api/auth/register/",
            {
                "username": "newperson",
                "email": "new@example.test",
                "password": "Strong-Example-42!",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(
            Category.objects.filter(owner__username="newperson").count(), 7
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 200)
        for identifier in ["newperson", "new@example.test"]:
            self.assertEqual(
                self.client.post(
                    "/api/auth/login/",
                    {"identifier": identifier, "password": "Strong-Example-42!"},
                ).status_code,
                200,
            )
        self.assertEqual(
            self.client.post(
                "/api/auth/login/", {"identifier": "newperson", "password": "wrong"}
            ).status_code,
            400,
        )

    def test_csrf_is_required_for_anonymous_login(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            client.post(
                "/api/auth/login/",
                {"identifier": "owner", "password": "Strong-Example-42!"},
            ).status_code,
            403,
        )
        token = client.get("/api/auth/csrf/").data["csrfToken"]
        self.assertEqual(
            client.post(
                "/api/auth/login/",
                {"identifier": "owner", "password": "Strong-Example-42!"},
                HTTP_X_CSRFTOKEN=token,
            ).status_code,
            200,
        )

    def test_verify_and_reset(self):
        self.client.force_authenticate(None)
        token = signing.dumps(
            {"id": self.user.pk, "email": self.user.email}, salt="verify-email"
        )
        self.assertEqual(
            self.client.post("/api/auth/verify/", {"token": token}).status_code, 200
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertEqual(
            self.client.post(
                "/api/auth/forgot/", {"email": self.user.email}
            ).status_code,
            200,
        )
        self.assertEqual(len(mail.outbox), 1)
        token = default_token_generator.make_token(self.user)
        self.assertEqual(
            self.client.post(
                "/api/auth/reset/",
                {
                    "uid": self.user.pk,
                    "token": token,
                    "password": "Another-Strong-Password-92!",
                },
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/auth/reset/",
                {
                    "uid": self.user.pk,
                    "token": token,
                    "password": "Another-Strong-Password-92!",
                },
            ).status_code,
            400,
        )

    def test_weak_password_and_case_duplicate(self):
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.post(
                "/api/auth/register/",
                {"username": "weak", "email": "weak@example.test", "password": "123"},
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/auth/register/",
                {
                    "username": "OWNER",
                    "email": "fresh@example.test",
                    "password": "Strong-Example-42!",
                },
            ).status_code,
            400,
        )

    def test_crud_conflict_and_isolation(self):
        item = self.create()
        url = f"/api/tasks/{item['id']}/"
        self.assertEqual(
            self.client.patch(
                url, {"title": "Changed", "version": 1}, format="json"
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                url, {"title": "Stale", "version": 1}, format="json"
            ).status_code,
            409,
        )
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {"version": 2}, format="json").status_code, 404
        )
        self.assertEqual(
            self.client.delete(url, {"version": 2}, format="json").status_code, 404
        )
        self.assertEqual(self.client.get("/api/tasks/").data, [])
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.delete(url, {"version": 2}, format="json").status_code, 204
        )

    def test_category_ownership_and_transfer(self):
        foreign = Category.objects.create(owner=self.other, name="Private")
        self.assertEqual(
            self.client.post(
                "/api/tasks/", {"title": "bad", "category": foreign.pk}
            ).status_code,
            400,
        )
        a = self.client.post(
            "/api/categories/", {"name": "A", "color": "#aabbcc", "icon": "work"}
        ).data
        b = self.client.post("/api/categories/", {"name": "B", "color": "#aabbcc"}).data
        task = self.create(category=a["id"])
        url = f"/api/categories/{a['id']}/"
        self.assertEqual(self.client.patch(url, {"name": "Renamed"}).status_code, 200)
        self.assertEqual(self.client.delete(url, {}, format="json").status_code, 400)
        self.assertEqual(
            self.client.delete(
                url, {"replacement": foreign.pk}, format="json"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.delete(
                url, {"replacement": b["id"]}, format="json"
            ).status_code,
            204,
        )
        self.assertEqual(Task.objects.get(pk=task["id"]).category_id, b["id"])
        self.assertEqual(Task.objects.get(pk=task["id"]).version, 2)

    def test_daily_recurrence_preserves_wall_clock_across_dst(self):
        self.create(
            start="2026-03-07T14:00:00Z",
            due=None,
            timezone="America/New_York",
            recurrence={"frequency": "daily", "count": 3},
        )
        items = list(Task.objects.order_by("occurrence"))
        self.assertEqual(len(items), 3)
        self.assertEqual(
            [x.start.astimezone(ZoneInfo("America/New_York")).hour for x in items],
            [9, 9, 9],
        )
        self.assertEqual(items[1].start.hour, 13)

    def test_all_day_and_weekdays(self):
        self.create(
            all_day=True,
            date="2026-10-26",
            timezone="Pacific/Auckland",
            recurrence={"frequency": "weekdays", "count": 3, "days": [0, 2]},
        )
        self.assertEqual(
            [str(x.date) for x in Task.objects.order_by("occurrence")],
            ["2026-10-26", "2026-10-28", "2026-11-02"],
        )
        self.assertTrue(all(x.due is None for x in Task.objects.all()))

    def test_scope_future_and_one(self):
        self.create(
            all_day=True,
            date="2026-10-26",
            recurrence={"frequency": "daily", "count": 3},
        )
        items = list(Task.objects.order_by("occurrence"))
        middle = items[1]
        self.assertEqual(
            self.client.patch(
                f"/api/tasks/{middle.pk}/",
                {
                    "version": 1,
                    "scope": "future",
                    "scope_versions": {str(x.pk): x.version for x in items},
                    "title": "Future",
                },
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            list(Task.objects.order_by("occurrence").values_list("title", flat=True)),
            ["Study", "Future", "Future"],
        )
        self.assertEqual(
            self.client.patch(
                f"/api/tasks/{middle.pk}/",
                {"version": 2, "scope": "one", "status": "completed"},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(Task.objects.filter(status="completed").count(), 1)

    def test_recurrence_rule_regeneration(self):
        item = self.create(
            all_day=True,
            date="2026-10-26",
            recurrence={"frequency": "daily", "count": 3},
        )
        r = self.client.patch(
            f"/api/tasks/{item['id']}/",
            {
                "version": 1,
                "scope": "series",
                "scope_versions": {str(x.pk): x.version for x in Task.objects.all()},
                "recurrence": {"frequency": "weekly", "count": 2},
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(
            list(Task.objects.order_by("occurrence").values_list("date", flat=True)),
            [datetime(2026, 10, 26).date(), datetime(2026, 11, 2).date()],
        )

    def test_reminder_reschedule_and_cancel(self):
        item = self.create(reminder_rules=[{"channel": "in_app", "minutes": 10}])
        first = Reminder.objects.get()
        r = self.client.patch(
            f"/api/tasks/{item['id']}/",
            {"version": 1, "due": (timezone.now() + timedelta(days=1)).isoformat()},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        first.refresh_from_db()
        self.assertEqual(first.state, "cancelled")
        self.assertEqual(Reminder.objects.filter(state="pending").count(), 1)
        self.client.patch(
            f"/api/tasks/{item['id']}/",
            {"version": 2, "status": "completed"},
            format="json",
        )
        self.assertFalse(Reminder.objects.filter(state="pending").exists())

    def test_notification_delivery_idempotency_and_isolation(self):
        self.create(
            due=(timezone.now() - timedelta(minutes=1)).isoformat(),
            reminder_rules=[{"channel": "in_app", "minutes": 0}],
        )
        reminder = Reminder.objects.get()
        deliver(reminder.pk)
        deliver(reminder.pk)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(self.client.get("/api/notifications/").status_code, 200)
        notice = Notification.objects.get()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/notifications/").data, [])
        self.assertEqual(
            self.client.post(f"/api/notifications/{notice.pk}/read/").status_code, 404
        )
        self.assertEqual(self.client.get("/api/reminders/").data, [])

    def test_email_consent_and_retry(self):
        self.create(
            due=(timezone.now() - timedelta(minutes=1)).isoformat(),
            reminder_rules=[{"channel": "email", "minutes": 0}],
        )
        r = Reminder.objects.get()
        deliver(r.pk)
        r.refresh_from_db()
        self.assertEqual(r.state, "cancelled")
        self.assertEqual(len(mail.outbox), 0)
        self.user.email_verified = True
        self.user.save()
        r.state = "pending"
        r.save()
        with patch(
            "notifications.jobs.EmailMultiAlternatives.send",
            side_effect=OSError("temporary"),
        ):
            deliver(r.pk)
        r.refresh_from_db()
        self.assertEqual(r.state, "retry")
        self.assertEqual(r.attempts, 1)
        r.scheduled_at = timezone.now() - timedelta(seconds=1)
        r.save()
        deliver(r.pk)
        deliver(r.pk)
        r.refresh_from_db()
        self.assertEqual(r.state, "accepted")
        self.assertEqual(len(mail.outbox), 1)

    def test_phone_verification_consent_and_unsubscribe(self):
        self.assertEqual(
            self.client.post(
                "/api/phone/",
                {"action": "start", "phone": "+15551234567", "consent": False},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/phone/",
                {"action": "start", "phone": "+15551234567", "consent": True},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/api/phone/", {"action": "verify", "code": "wrong"}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/phone/", {"action": "verify", "code": "000000"}
            ).status_code,
            200,
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.phone_verified)
        self.create(
            due=(timezone.now() - timedelta(minutes=1)).isoformat(),
            reminder_rules=[{"channel": "sms", "minutes": 0}],
        )
        self.client.post("/api/phone/", {"action": "unsubscribe"})
        deliver(Reminder.objects.get().pk)
        self.assertEqual(Reminder.objects.get().state, "cancelled")
        cache.clear()
        self.client.post(
            "/api/phone/",
            {"action": "start", "phone": "+15557654321", "consent": True},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertFalse(self.user.phone_verified)

    def test_invalid_dates_and_phone_rules(self):
        for data in [
            {"title": "Bad", "all_day": True},
            {"title": "Bad", "start": "2026-01-01T12:00Z", "end": "2026-01-01T10:00Z"},
            {"title": "Bad", "timezone": "Invalid/Zone"},
            {
                "title": "Bad",
                "due": "2026-01-01T12:00Z",
                "reminder_rules": [{"channel": "sms", "minutes": 10}],
            },
        ]:
            self.assertEqual(
                self.client.post("/api/tasks/", data, format="json").status_code, 400
            )

    def test_retry_limit_and_late_policy(self):
        self.user.email_verified = True
        self.user.save()
        self.create(
            due=(timezone.now() - timedelta(minutes=1)).isoformat(),
            reminder_rules=[{"channel": "email", "minutes": 0}],
        )
        r = Reminder.objects.get()
        with patch(
            "notifications.jobs.EmailMultiAlternatives.send", side_effect=OSError()
        ):
            for _ in range(4):
                r.scheduled_at = timezone.now() - timedelta(seconds=1)
                r.save()
                deliver(r.pk)
                r.refresh_from_db()
        self.assertEqual(r.state, "failed")
        self.assertEqual(r.attempts, 4)
        r.state = "pending"
        r.scheduled_at = timezone.now() - timedelta(days=2)
        r.save()
        deliver(r.pk)
        r.refresh_from_db()
        self.assertEqual(r.state, "cancelled")

    def test_title_edit_does_not_resend_accepted_reminder(self):
        item = self.create(
            due=(timezone.now() - timedelta(minutes=1)).isoformat(),
            reminder_rules=[{"channel": "in_app", "minutes": 0}],
        )
        reminder = Reminder.objects.get()
        deliver(reminder.pk)
        self.client.patch(
            f"/api/tasks/{item['id']}/",
            {"title": "Renamed", "version": 1},
            format="json",
        )
        self.assertEqual(Reminder.objects.count(), 1)
        deliver(reminder.pk)
        self.assertEqual(Notification.objects.count(), 1)

    def test_auth_rate_limit(self):
        self.client.force_authenticate(None)
        statuses = [
            self.client.post(
                "/api/auth/login/", {"identifier": "missing", "password": "bad"}
            ).status_code
            for _ in range(13)
        ]
        self.assertEqual(statuses[-1], 429)

    def test_events_only_after_commit(self):
        with patch("notifications.events.get_channel_layer") as layer:
            layer.return_value.group_send = AsyncMock()
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                self.create()
                self.assertFalse(layer.called)
            self.assertEqual(len(callbacks), 1)
            self.assertTrue(layer.called)

    def test_series_edit_rejects_newer_sibling(self):
        item = self.create(
            all_day=True,
            date="2026-10-26",
            recurrence={"frequency": "daily", "count": 3},
        )
        rows = list(Task.objects.order_by("occurrence"))
        versions = {str(x.pk): x.version for x in rows}
        self.client.patch(
            f"/api/tasks/{rows[1].pk}/",
            {"version": 1, "title": "Newer edit"},
            format="json",
        )
        result = self.client.patch(
            f"/api/tasks/{item['id']}/",
            {
                "version": 1,
                "scope": "series",
                "scope_versions": versions,
                "title": "Stale group edit",
            },
            format="json",
        )
        self.assertEqual(result.status_code, 409)
        self.assertEqual(Task.objects.get(pk=rows[1].pk).title, "Newer edit")

    def test_clearing_schedule_cancels_reminders(self):
        item = self.create(reminder_rules=[{"channel": "in_app", "minutes": 10}])
        response = self.client.patch(
            f"/api/tasks/{item['id']}/",
            {"version": 1, "due": None, "reminder_rules": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Reminder.objects.get().state, "cancelled")


class WebsocketTests(TransactionTestCase):
    def test_auth_origin_and_owner_groups(self):
        user = User.objects.create_user(
            username="ws", email="ws@example.test", password="Strong-Example-42!"
        )
        other = User.objects.create_user(
            username="ws2", email="ws2@example.test", password="Strong-Example-42!"
        )
        a = APIClient()
        a.force_login(user)
        cookie = a.cookies["sessionid"].value
        b = APIClient()
        b.force_login(other)
        other_cookie = b.cookies["sessionid"].value

        async def run():
            anon = WebsocketCommunicator(
                application,
                "/ws/updates/",
                headers=[(b"origin", b"http://localhost:5173")],
            )
            self.assertFalse((await anon.connect())[0])
            bad = WebsocketCommunicator(
                application,
                "/ws/updates/",
                headers=[
                    (b"origin", b"https://evil.test"),
                    (b"cookie", f"sessionid={cookie}".encode()),
                ],
            )
            self.assertFalse((await bad.connect())[0])
            first = WebsocketCommunicator(
                application,
                "/ws/updates/",
                headers=[
                    (b"origin", b"http://localhost:5173"),
                    (b"cookie", f"sessionid={cookie}".encode()),
                ],
            )
            second = WebsocketCommunicator(
                application,
                "/ws/updates/",
                headers=[
                    (b"origin", b"http://localhost:5173"),
                    (b"cookie", f"sessionid={other_cookie}".encode()),
                ],
            )
            self.assertTrue((await first.connect())[0])
            self.assertTrue((await second.connect())[0])
            from channels.layers import get_channel_layer

            await get_channel_layer().group_send(
                f"user_{user.pk}", {"type": "changed", "kind": "tasks.changed"}
            )
            self.assertEqual((await first.receive_json_from())["type"], "tasks.changed")
            self.assertTrue(await second.receive_nothing(timeout=0.1))
            await first.disconnect()
            await second.disconnect()

        async_to_sync(run)()


class DeliveryConcurrencyTests(TransactionTestCase):
    def test_concurrent_workers_create_one_notification(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import connection, close_old_connections

        if connection.vendor != "postgresql":
            self.skipTest("Row-lock behavior requires PostgreSQL")
        user = User.objects.create_user(
            username="parallel", email="parallel@example.test"
        )
        task = Task.objects.create(
            owner=user,
            title="Concurrent reminder",
            due=timezone.now() - timedelta(seconds=1),
            reminder_rules=[{"channel": "in_app", "minutes": 0}],
        )
        from tasks.services import schedule

        schedule(task)
        reminder = Reminder.objects.get(task=task)

        def run():
            close_old_connections()
            try:
                deliver(reminder.pk)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = [executor.submit(run) for _ in range(2)]
            for result in results:
                result.result(timeout=10)
        self.assertEqual(Notification.objects.filter(reminder=reminder).count(), 1)
        reminder.refresh_from_db()
        self.assertEqual(reminder.attempts, 1)
