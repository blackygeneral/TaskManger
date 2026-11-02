from datetime import timedelta, datetime, time
from zoneinfo import ZoneInfo
from dateutil.tz import resolve_imaginary
from django.utils import timezone
from tasks.models import Task
from notifications.models import Reminder


def anchor(task):
    if task.all_day:
        return datetime.combine(task.date, time(9), ZoneInfo(task.timezone))
    return task.due or task.start


def schedule(task):
    import hashlib
    from datetime import timezone as utc_timezone

    if task.status in ["completed", "cancelled"]:
        Reminder.objects.filter(task=task, state__in=["pending", "retry"]).update(
            state="cancelled"
        )
        return
    base = anchor(task)
    if not base:
        Reminder.objects.filter(task=task, state__in=["pending", "retry"]).update(
            state="cancelled"
        )
        return
    keys = []
    for i, rule in enumerate(task.reminder_rules):
        when = (
            datetime.fromisoformat(rule["at"].replace("Z", "+00:00"))
            if "at" in rule
            else base - timedelta(minutes=rule["minutes"])
        )
        identity = f"{task.pk}:{i}:{rule['channel']}:{when.astimezone(utc_timezone.utc).isoformat()}"
        key = hashlib.sha256(identity.encode()).hexdigest()
        keys.append(key)
        reminder, created = Reminder.objects.get_or_create(
            key=key,
            defaults={"task": task, "channel": rule["channel"], "scheduled_at": when},
        )
        if not created and reminder.state == "cancelled" and when > timezone.now():
            reminder.state = "pending"
            reminder.attempts = 0
            reminder.scheduled_at = when
            reminder.save()
    Reminder.objects.filter(task=task, state__in=["pending", "retry"]).exclude(
        key__in=keys
    ).update(state="cancelled")


def expand(task):
    rule = task.recurrence
    if not rule:
        return
    zone = ZoneInfo(task.timezone)
    origin = (
        task.date if task.all_day else (task.start or task.due).astimezone(zone).date()
    )
    current = origin
    for index in range(1, rule["count"]):
        if rule["frequency"] == "weekly":
            current += timedelta(days=7)
        else:
            current += timedelta(days=1)
            if rule["frequency"] == "weekdays":
                while current.weekday() not in rule["days"]:
                    current += timedelta(days=1)
        delta = current - origin
        values = {
            field.name: getattr(task, field.name)
            for field in Task._meta.fields
            if field.name not in ["id", "created_at", "updated_at", "occurrence"]
        }
        for field in ["start", "end", "due"]:
            if values[field]:
                values[field] = resolve_imaginary(
                    values[field].astimezone(zone) + delta
                )
        for field in ["date", "end_date"]:
            if values[field]:
                values[field] += delta
        values["reminder_rules"] = [
            {
                **r,
                "at": (
                    datetime.fromisoformat(r["at"].replace("Z", "+00:00")).astimezone(
                        zone
                    )
                    + delta
                ).isoformat(),
            }
            if "at" in r
            else r
            for r in task.reminder_rules
        ]
        child = Task.objects.create(**values, occurrence=index)
        schedule(child)
