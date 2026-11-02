from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from accounts.views import AuthView, ProfileView, PhoneView
from tasks.views import TaskViewSet
from categories.views import CategoryViewSet
from notifications.views import NotificationViewSet, ReminderViewSet

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")
router.register("categories", CategoryViewSet, basename="category")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("reminders", ReminderViewSet, basename="reminder")
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/<str:action>/", AuthView.as_view()),
    path("api/profile/", ProfileView.as_view()),
    path("api/phone/", PhoneView.as_view()),
    path("api/", include(router.urls)),
]

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
