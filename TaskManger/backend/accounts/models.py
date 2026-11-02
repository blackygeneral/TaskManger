from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class User(AbstractUser):
    email = models.EmailField(unique=True)
    timezone = models.CharField(max_length=64, default="UTC")
    language = models.CharField(max_length=2, default="en")
    theme = models.CharField(max_length=10, default="system")
    email_verified = models.BooleanField(default=False)
    email_notifications = models.BooleanField(default=True)
    phone = models.CharField(max_length=16, blank=True)
    phone_verified = models.BooleanField(default=False)
    sms_consent = models.BooleanField(default=False)
    sms_consent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="unique_email_ci"),
            models.UniqueConstraint(Lower("username"), name="unique_username_ci"),
        ]
