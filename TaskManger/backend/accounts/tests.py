from django.test import TestCase
from django.core.cache import cache
from rest_framework.test import APIClient


class JsonErrorTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_csrf_failure_returns_json(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            "/api/auth/login/", {"identifier": "nobody", "password": "invalid"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertIn("CSRF", response.json()["detail"])

    def test_invalid_username_returns_validation_json(self):
        response = APIClient().post(
            "/api/auth/register/",
            {
                "username": "invalid name!",
                "email": "test@example.test",
                "password": "Strong-TaskFlow-42!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json())

    def test_redis_outage_returns_503_without_bypassing_throttle(self):
        from unittest.mock import patch
        from redis.exceptions import ConnectionError

        with patch(
            "accounts.views.AuthThrottle.allow_request",
            side_effect=ConnectionError("unavailable"),
        ):
            response = APIClient().post("/api/auth/register/", {}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertIn("Redis", response.json()["detail"])
        self.assertEqual(response["Retry-After"], "5")
