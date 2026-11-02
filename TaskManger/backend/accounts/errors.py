from django.http import JsonResponse
from django.views.csrf import csrf_failure as django_csrf_failure


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/"):
        return JsonResponse(
            {
                "detail": "CSRF verification failed. Refresh the page and use the same hostname for the app and login."
            },
            status=403,
        )
    return django_csrf_failure(request, reason=reason)
