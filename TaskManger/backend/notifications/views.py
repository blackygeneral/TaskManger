from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from notifications.models import Notification, Reminder
from notifications.events import publish


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "task", "read", "created_at"]
        read_only_fields = ["id", "title", "task", "created_at"]


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(owner=self.request.user)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        item = self.get_object()
        item.read = True
        item.save()
        publish(request.user.pk, "notifications.changed")
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        self.get_queryset().update(read=True)
        publish(request.user.pk, "notifications.changed")
        return Response({"ok": True})


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = [
            "id",
            "task",
            "channel",
            "scheduled_at",
            "state",
            "attempts",
            "accepted_at",
            "last_error",
        ]


class ReminderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReminderSerializer

    def get_queryset(self):
        return Reminder.objects.filter(task__owner=self.request.user).order_by(
            "-scheduled_at"
        )
