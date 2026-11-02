from django.db import models
from django.conf import settings


class Reminder(models.Model):
    task = models.ForeignKey(
        "tasks.Task", on_delete=models.CASCADE, related_name="reminders"
    )
    key = models.CharField(max_length=160, unique=True)
    channel = models.CharField(max_length=10)
    scheduled_at = models.DateTimeField(db_index=True)
    state = models.CharField(max_length=20, default="pending", db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    accepted_at = models.DateTimeField(null=True)
    provider_id = models.CharField(max_length=100, blank=True)
    last_error = models.CharField(max_length=100, blank=True)


class Notification(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    task = models.ForeignKey("tasks.Task", null=True, on_delete=models.SET_NULL)
    reminder = models.OneToOneField(Reminder, null=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=250)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
