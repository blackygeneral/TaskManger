from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.exceptions import APIException, ValidationError
from tasks.models import Task
from tasks.serializers import TaskSerializer
from tasks.services import schedule, expand
from notifications.events import publish


class Conflict(APIException):
    status_code = 409
    default_detail = "This task changed in another window. Reload before saving."


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer

    def get_queryset(self):
        qs = Task.objects.filter(owner=self.request.user)
        p = self.request.query_params
        if p.get("search"):
            qs = qs.filter(
                Q(title__icontains=p["search"]) | Q(description__icontains=p["search"])
            )
        for key in ["status", "priority", "category"]:
            if p.get(key):
                qs = qs.filter(**{key: p[key]})
        ordering = p.get("ordering", "-created_at")
        if ordering in ["due", "start", "title", "-created_at", "priority"]:
            qs = qs.order_by(ordering, "id")
        return qs

    @transaction.atomic
    def perform_create(self, s):
        task = s.save(owner=self.request.user, version=1)
        if task.status == "completed":
            task.completed_at = timezone.now()
            task.save()
        schedule(task)
        expand(task)
        publish(self.request.user.pk)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        task = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
        if request.data.get("version") != task.version:
            raise Conflict()
        scope = request.data.get("scope", "one")
        if scope not in ["one", "future", "series"]:
            raise ValidationError("Invalid edit scope")
        serializer = self.get_serializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        recurrence_changed = (
            "recurrence" in request.data
            and request.data["recurrence"] != task.recurrence
        )
        if recurrence_changed and scope == "one" and task.recurrence:
            raise ValidationError("Change recurrence using future or series scope")
        targets = Task.objects.select_for_update().filter(
            owner=request.user, series=task.series
        )
        if scope == "one":
            targets = targets.filter(pk=task.pk)
        elif scope == "future":
            targets = targets.filter(occurrence__gte=task.occurrence)
        if scope != "one":
            versions = request.data.get("scope_versions", {})
            if not isinstance(versions, dict) or any(
                versions.get(str(row.pk)) != row.version for row in targets
            ):
                raise Conflict()
        if recurrence_changed:
            if scope == "series" and task.occurrence != 0:
                raise ValidationError(
                    "Edit the first occurrence to change the entire recurrence rule"
                )
            targets.exclude(pk=task.pk).delete()
            task = serializer.save(version=task.version + 1)
            # Regenerated branches get a new series identity; existing past occurrences remain intact.
            import uuid

            task.series = uuid.uuid4()
            task.occurrence = 0
            task.completed_at = timezone.now() if task.status == "completed" else None
            task.save()
            schedule(task)
            expand(task)
        else:
            changes = dict(serializer.validated_data)
            changes.pop("version", None)
            original = {
                k: getattr(task, k) for k in ["start", "end", "due", "date", "end_date"]
            }
            for target in targets:
                for key, value in changes.items():
                    if (
                        target.pk != task.pk
                        and key in original
                        and value
                        and original[key]
                        and getattr(target, key)
                    ):
                        if key in ["start", "end", "due"]:
                            from zoneinfo import ZoneInfo

                            zone = ZoneInfo(task.timezone)
                            value = getattr(target, key).astimezone(zone) + (
                                value.astimezone(zone) - original[key].astimezone(zone)
                            )
                        else:
                            value = getattr(target, key) + (value - original[key])
                    setattr(target, key, value)
                target.version += 1
                target.completed_at = (
                    (target.completed_at or timezone.now())
                    if target.status == "completed"
                    else None
                )
                target.save()
                schedule(target)
        publish(request.user.pk)
        return Response(self.get_serializer(Task.objects.get(pk=task.pk)).data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        task = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
        if request.data.get("version") != task.version:
            raise Conflict()
        scope = request.data.get("scope", "one")
        if scope not in ["one", "future", "series"]:
            raise ValidationError("Invalid scope")
        qs = Task.objects.filter(owner=request.user, series=task.series)
        if scope == "one":
            qs = qs.filter(pk=task.pk)
        elif scope == "future":
            qs = qs.filter(occurrence__gte=task.occurrence)
        if scope != "one":
            versions = request.data.get("scope_versions", {})
            if not isinstance(versions, dict) or any(
                versions.get(str(row.pk)) != row.version
                for row in qs.select_for_update()
            ):
                raise Conflict()
        qs.delete()
        publish(request.user.pk)
        return Response(status=204)
