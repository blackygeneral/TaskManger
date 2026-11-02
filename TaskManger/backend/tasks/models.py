import uuid
from django.db import models
from django.conf import settings


class Task(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    category = models.ForeignKey(
        "categories.Category", null=True, blank=True, on_delete=models.SET_NULL
    )
    status = models.CharField(
        max_length=20,
        choices=[(s, s) for s in ["todo", "in_progress", "completed", "cancelled"]],
        default="todo",
    )
    priority = models.CharField(
        max_length=10,
        choices=[(s, s) for s in ["low", "medium", "high", "urgent"]],
        default="medium",
    )
    start = models.DateTimeField(null=True, blank=True)
    end = models.DateTimeField(null=True, blank=True)
    due = models.DateTimeField(null=True, blank=True)
    all_day = models.BooleanField(default=False)
    date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    subtasks = models.JSONField(default=list)
    recurrence = models.JSONField(default=dict)
    series = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    occurrence = models.PositiveIntegerField(default=0)
    reminder_rules = models.JSONField(default=list)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["series", "occurrence"], name="unique_occurrence"
            )
        ]
