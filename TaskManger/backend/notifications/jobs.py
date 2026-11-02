from datetime import timedelta
from celery import shared_task
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from notifications.models import Reminder, Notification
from notifications.events import publish
from notifications.providers import provider
from accounts.models import User
from tasks.models import Task


@shared_task
def dispatch_due():
    ids = list(
        Reminder.objects.filter(
            state__in=["pending", "retry"], scheduled_at__lte=timezone.now()
        ).values_list("id", flat=True)[:200]
    )
    for pk in ids:
        deliver.delay(pk)
    return len(ids)


@shared_task
def deliver(pk):
    # Lock the task before the reminder, matching API edit/delete lock order.
    task_id = Reminder.objects.filter(pk=pk).values_list("task_id", flat=True).first()
    if not task_id:
        return
    with transaction.atomic():
        task = Task.objects.select_for_update().filter(pk=task_id).first()
        if not task:
            return
        reminder = Reminder.objects.select_for_update().filter(pk=pk).first()
        if (
            not reminder
            or reminder.state not in ["pending", "retry"]
            or reminder.scheduled_at > timezone.now()
        ):
            return
        user = User.objects.select_for_update().get(pk=task.owner_id)
        if task.status in [
            "completed",
            "cancelled",
        ] or reminder.scheduled_at < timezone.now() - timedelta(hours=24):
            reminder.state = "cancelled"
            reminder.save()
            return
        allowed = (
            reminder.channel == "in_app"
            or (
                reminder.channel == "email"
                and user.email_notifications
                and user.email_verified
            )
            or (
                reminder.channel == "sms"
                and user.sms_consent
                and user.phone_verified
                and settings.SMS_PROVIDER != "disabled"
            )
        )
        if not allowed:
            reminder.state = "cancelled"
            reminder.save()
            return
        reminder.attempts += 1
        try:
            link = f"{settings.PUBLIC_URL}/tasks?task={task.pk}"
            from tasks.services import anchor
            from zoneinfo import ZoneInfo

            when = anchor(task)
            display = (
                str(task.date)
                if task.all_day
                else when.astimezone(ZoneInfo(user.timezone)).strftime(
                    "%Y-%m-%d %H:%M %Z"
                )
            )
            category = task.category.name if task.category else "Uncategorized"
            body = f"{task.title}\n{display} · {category}\n{link}"
            if reminder.channel == "in_app":
                Notification.objects.get_or_create(
                    reminder=reminder,
                    defaults={"owner": user, "task": task, "title": task.title},
                )
                reminder.state = "created"
                publish(user.pk, "notifications.changed")
            elif reminder.channel == "email":
                mail = EmailMultiAlternatives(
                    f"TaskFlow reminder: {task.title}",
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                )
                mail.attach_alternative(
                    f'<div style="font-family:sans-serif;padding:32px;background:#f4f5fb"><h2>TaskFlow</h2><h1>{escape(task.title)}</h1><p>{escape(display)} · {escape(category)}</p><p><a href="{escape(link)}">Open task</a></p></div>',
                    "text/html",
                )
                mail.send()
                reminder.state = "accepted"
            else:
                reminder.provider_id = provider().send(user.phone, body)
                reminder.state = (
                    "simulated" if settings.SMS_PROVIDER == "mock" else "accepted"
                )
            reminder.accepted_at = timezone.now()
            reminder.last_error = ""
        except Exception as error:
            reminder.last_error = type(error).__name__
            reminder.state = "failed" if reminder.attempts >= 4 else "retry"
            reminder.scheduled_at = timezone.now() + timedelta(
                minutes=2**reminder.attempts
            )
        reminder.save()
