from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    TimeoutError as RedisTimeoutError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as default_exception_handler


def exception_handler(exc, context):
    if isinstance(exc, (RedisConnectionError, RedisTimeoutError)):
        # Fail closed: never bypass authentication rate limits during an outage.
        return Response(
            {
                "detail": "Redis is unavailable. Start the configured Redis service and try again."
            },
            status=503,
            headers={"Retry-After": "5"},
        )
    return default_exception_handler(exc, context)
