from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import re
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.exceptions import ValidationError
from rest_framework import serializers
from accounts.models import User
from categories.models import Category
from notifications.providers import provider


class AuthThrottle(AnonRateThrottle):
    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope
            + ":"
            + str(view.kwargs.get("action", request.data.get("action", ""))),
            "ident": self.get_ident(request),
        }


class PhoneThrottle(AuthThrottle):
    scope = "phone"


def profile(user):
    fields = [
        "id",
        "username",
        "email",
        "first_name",
        "timezone",
        "language",
        "theme",
        "email_verified",
        "email_notifications",
        "phone",
        "phone_verified",
        "sms_consent",
    ]
    return {
        **{k: getattr(user, k) for k in fields},
        "sms_provider": settings.SMS_PROVIDER,
    }


def verification(user):
    token = signing.dumps({"id": user.pk, "email": user.email}, salt="verify-email")
    send_mail(
        "Verify your TaskFlow email",
        f"Confirm your email: {settings.PUBLIC_URL}/verify?token={token}",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


@method_decorator(csrf_protect, name="dispatch")
class AuthView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    def get_throttles(self):
        if self.request.method == "GET" or self.kwargs.get("action") == "logout":
            return []
        return super().get_throttles()

    def get(self, request, action):
        if action == "csrf":
            return Response({"csrfToken": get_token(request)})
        if action == "me":
            return (
                Response(profile(request.user))
                if request.user.is_authenticated
                else Response({"detail": "Sign in required"}, status=401)
            )
        return Response(status=404)

    def post(self, request, action):
        data = request.data
        if action == "register":
            username = str(data.get("username", "")).strip()
            email = str(data.get("email", "")).strip().lower()
            password = data.get("password", "")
            serializers.EmailField().run_validation(email)
            try:
                User._meta.get_field("username").run_validators(username)
            except DjangoValidationError as error:
                raise ValidationError({"username": error.messages})
            if not username or len(username) > 150:
                raise ValidationError("Invalid username")
            zone = str(data.get("timezone", "UTC"))
            try:
                ZoneInfo(zone)
            except (ZoneInfoNotFoundError, ValueError):
                raise ValidationError("Unknown timezone")
            user = User(username=username, email=email, timezone=zone)
            try:
                validate_password(password, user)
            except DjangoValidationError as e:
                raise ValidationError(e.messages)
            try:
                with transaction.atomic():
                    user.set_password(password)
                    user.save()
                    for name, color, icon in [
                        ("Gym", "#f97316", "fitness"),
                        ("Cooking", "#f59e0b", "restaurant"),
                        ("Work", "#6366f1", "work"),
                        ("Study", "#3b82f6", "school"),
                        ("Personal", "#8b5cf6", "person"),
                        ("Shopping", "#ec4899", "cart"),
                        ("Health", "#10b981", "heart"),
                    ]:
                        Category.objects.create(
                            owner=user, name=name, color=color, icon=icon
                        )
            except IntegrityError:
                raise ValidationError("Username or email already registered")
            login(request, user)
            try:
                verification(user)
            except Exception:
                return Response(
                    {
                        **profile(user),
                        "mail_warning": "Verification email could not be sent. Retry from Account.",
                    },
                    status=201,
                )
            return Response(profile(user), status=201)
        if action == "login":
            identifier = str(data.get("identifier", "")).strip()
            found = User.objects.filter(
                Q(email__iexact=identifier) | Q(username__iexact=identifier)
            ).first()
            user = authenticate(
                request,
                username=found.username if found else identifier,
                password=data.get("password", ""),
            )
            if user is None:
                raise ValidationError("Invalid login credentials")
            login(request, user)
            return Response(profile(user))
        if action == "logout":
            logout(request)
            return Response({"ok": True})
        if action == "forgot":
            user = User.objects.filter(email__iexact=data.get("email", "")).first()
            if user:
                token = default_token_generator.make_token(user)
                try:
                    send_mail(
                        "Reset your TaskFlow password",
                        f"{settings.PUBLIC_URL}/reset?uid={user.pk}&token={token}",
                        settings.DEFAULT_FROM_EMAIL,
                        [user.email],
                    )
                except Exception:
                    pass
            return Response(
                {"detail": "If this account exists, a reset link has been requested."}
            )
        if action == "reset":
            try:
                uid = int(data.get("uid", 0))
            except (ValueError, TypeError):
                raise ValidationError("Invalid reset link")
            user = User.objects.filter(pk=uid).first()
            if not user or not default_token_generator.check_token(
                user, data.get("token", "")
            ):
                raise ValidationError("Invalid or expired reset link")
            try:
                validate_password(data.get("password", ""), user)
            except DjangoValidationError as e:
                raise ValidationError(e.messages)
            user.set_password(data["password"])
            user.save()
            return Response({"ok": True})
        if action == "verify":
            try:
                payload = signing.loads(
                    data.get("token", ""), salt="verify-email", max_age=86400
                )
            except signing.BadSignature:
                raise ValidationError("Invalid or expired verification link")
            User.objects.filter(pk=payload["id"], email=payload["email"]).update(
                email_verified=True
            )
            return Response({"ok": True})
        if action == "resend" and request.user.is_authenticated:
            try:
                verification(request.user)
            except Exception:
                return Response(
                    {"detail": "Email service unavailable; retry later"}, status=503
                )
            return Response({"ok": True})
        return Response(status=404)


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["first_name", "timezone", "theme", "language", "email_notifications"]

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Unknown time zone")
        return value

    def validate_theme(self, value):
        if value not in ["light", "dark", "system"]:
            raise serializers.ValidationError("Invalid theme")
        return value

    def validate_language(self, value):
        if value not in ["ar", "en"]:
            raise serializers.ValidationError("Invalid language")
        return value


class ProfileView(APIView):
    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(profile(request.user))


class PhoneView(APIView):
    throttle_classes = [PhoneThrottle]

    def get_throttles(self):
        if self.request.data.get("action") in ["remove", "unsubscribe"]:
            return []
        return super().get_throttles()

    def post(self, request):
        user = request.user
        action = request.data.get("action")
        if action == "remove":
            user.phone = ""
            user.phone_verified = False
            user.sms_consent = False
            user.sms_consent_at = None
            user.save()
            return Response(profile(user))
        if action == "unsubscribe":
            user.sms_consent = False
            user.sms_consent_at = None
            user.save()
            return Response(profile(user))
        if action == "start":
            phone = request.data.get("phone", "")
            if not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
                raise ValidationError("Use international E.164 format")
            if request.data.get("consent") is not True:
                raise ValidationError("Explicit consent required")
            if settings.SMS_PROVIDER == "disabled":
                raise ValidationError("SMS is disabled")
            user.phone = phone
            user.phone_verified = False
            user.sms_consent = True
            user.sms_consent_at = timezone.now()
            user.save()
            try:
                provider().start_verification(phone)
            except Exception:
                return Response(
                    {"detail": "Verification provider unavailable"}, status=503
                )
            request.session["phone_verification"] = {
                "phone": phone,
                "at": timezone.now().timestamp(),
                "attempts": 0,
            }
            return Response(
                {
                    "mock": settings.SMS_PROVIDER == "mock",
                    "detail": "Local simulation: use 000000"
                    if settings.SMS_PROVIDER == "mock"
                    else "Verification requested",
                }
            )
        if action == "verify":
            challenge = request.session.get("phone_verification", {})
            if (
                challenge.get("phone") != user.phone
                or timezone.now().timestamp() - challenge.get("at", 0) > 600
                or challenge.get("attempts", 0) >= 5
            ):
                raise ValidationError("Request a new verification code")
            challenge["attempts"] += 1
            request.session["phone_verification"] = challenge
            if not user.sms_consent or not provider().check_verification(
                user.phone, str(request.data.get("code", ""))
            ):
                raise ValidationError("Invalid verification code")
            user.phone_verified = True
            user.save()
            del request.session["phone_verification"]
            return Response(profile(user))
        raise ValidationError("Unknown action")
