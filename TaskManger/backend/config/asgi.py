import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from django.core.asgi import get_asgi_application

django_app = get_asgi_application()
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.urls import path
from notifications.consumers import UpdatesConsumer

application = ProtocolTypeRouter(
    {
        "http": django_app,
        "websocket": OriginValidator(
            AuthMiddlewareStack(
                URLRouter([path("ws/updates/", UpdatesConsumer.as_asgi())])
            ),
            settings.CSRF_TRUSTED_ORIGINS,
        ),
    }
)
