import re
from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from categories.models import Category
from notifications.events import publish


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "color", "icon"]

    def validate_color(self, value):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise serializers.ValidationError("Use a hex color")
        return value

    def validate_name(self, value):
        qs = Category.objects.filter(owner=self.context["request"].user, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Category already exists")
        return value


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(owner=self.request.user).order_by("name")

    def perform_create(self, s):
        s.save(owner=self.request.user)
        publish(self.request.user.pk, "categories.changed")

    def perform_update(self, s):
        s.save()
        publish(self.request.user.pk, "categories.changed")

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if "replacement" not in request.data:
            raise ValidationError("Choose replacement category or null")
        target = request.data["replacement"]
        if target is not None:
            target = (
                self.get_queryset().filter(pk=target).exclude(pk=category.pk).first()
            )
            if not target:
                raise ValidationError("Invalid replacement")
        from tasks.models import Task
        from django.db.models import F

        Task.objects.filter(category=category, owner=request.user).update(
            category=target, version=F("version") + 1
        )
        category.delete()
        publish(request.user.pk, "categories.changed")
        return Response(status=204)
