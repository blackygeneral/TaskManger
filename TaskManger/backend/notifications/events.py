from django.db import transaction
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging


def publish(owner_id, kind="tasks.changed"):
    def send():
        try:
            async_to_sync(get_channel_layer().group_send)(
                f"user_{owner_id}", {"type": "changed", "kind": kind}
            )
        except Exception:
            logging.getLogger(__name__).warning(
                "Realtime transport unavailable; clients will refetch"
            )

    transaction.on_commit(send)
