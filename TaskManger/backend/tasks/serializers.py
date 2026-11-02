from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from datetime import datetime
from rest_framework import serializers
from tasks.models import Task
from categories.models import Category


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        exclude = ["owner"]
        read_only_fields = [
            "series",
            "occurrence",
            "created_at",
            "updated_at",
            "completed_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = Category.objects.filter(
            owner=self.context["request"].user
        )

    def validate_timezone(self, v):
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Invalid timezone")
        return v

    def validate_subtasks(self, v):
        if (
            not isinstance(v, list)
            or len(v) > 100
            or any(
                not isinstance(x, dict)
                or not isinstance(x.get("title"), str)
                or len(x["title"]) > 200
                or not isinstance(x.get("done"), bool)
                for x in v
            )
        ):
            raise serializers.ValidationError(
                "Expected up to 100 {title, done} entries"
            )
        return v

    def validate_recurrence(self, v):
        if not v:
            return {}
        if not isinstance(v, dict) or v.get("frequency") not in [
            "daily",
            "weekly",
            "weekdays",
        ]:
            raise serializers.ValidationError("Invalid recurrence")
        if not isinstance(v.get("count"), int) or not 2 <= v["count"] <= 366:
            raise serializers.ValidationError("Count must be 2–366")
        if v["frequency"] == "weekdays" and (
            not isinstance(v.get("days"), list)
            or not v["days"]
            or any(type(d) != int or d not in range(7) for d in v["days"])
        ):
            raise serializers.ValidationError("Select weekdays (Monday=0)")
        return v

    def validate_reminder_rules(self, v):
        if not isinstance(v, list) or len(v) > 12:
            raise serializers.ValidationError("Maximum 12 reminders")
        for rule in v:
            if not isinstance(rule, dict) or rule.get("channel") not in [
                "in_app",
                "email",
                "sms",
            ]:
                raise serializers.ValidationError("Invalid channel")
            if "at" in rule:
                try:
                    dt = datetime.fromisoformat(rule["at"].replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise serializers.ValidationError(
                        "Custom reminder requires an ISO datetime with offset"
                    )
            elif type(rule.get("minutes")) != int or not 0 <= rule["minutes"] <= 525600:
                raise serializers.ValidationError("Invalid reminder offset")
            if rule["channel"] == "sms":
                u = self.context["request"].user
                if not (u.phone_verified and u.sms_consent):
                    raise serializers.ValidationError(
                        "Verify your phone and enable SMS consent first"
                    )
        return v

    def validate(self, attrs):
        def value(k, default=None):
            return attrs.get(k, getattr(self.instance, k, default))

        if value("all_day", False):
            if not value("date"):
                raise serializers.ValidationError(
                    {"date": "All-day tasks require a date"}
                )
            if value("end_date") and value("end_date") <= value("date"):
                raise serializers.ValidationError(
                    "All-day end date is exclusive and must follow start date"
                )
            attrs.update(start=None, end=None, due=None)
        else:
            attrs.update(date=None, end_date=None)
            if value("end") and not value("start"):
                raise serializers.ValidationError("End requires a start")
            if value("start") and value("end") and value("end") <= value("start"):
                raise serializers.ValidationError("End must follow start")
        if value("recurrence", {}) and not (
            value("date") if value("all_day") else value("start") or value("due")
        ):
            raise serializers.ValidationError("Recurring tasks need a date")
        if value("reminder_rules", []) and not (
            value("date") if value("all_day") else value("due") or value("start")
        ):
            raise serializers.ValidationError("Reminders need a task date")
        return attrs
