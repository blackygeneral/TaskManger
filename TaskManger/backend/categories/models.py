from django.conf import settings
from django.db import models


class Category(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=7, default="#6366f1")
    icon = models.CharField(max_length=30, default="label")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"], name="unique_category_owner"
            )
        ]
