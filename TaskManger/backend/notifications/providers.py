from django.conf import settings


class MockProvider:
    def start_verification(self, phone):
        return None

    def check_verification(self, phone, code):
        return code == "000000"

    def send(self, phone, body):
        return "simulated"


class TwilioProvider:
    def __init__(self):
        from twilio.rest import Client
        from twilio.http.http_client import TwilioHttpClient

        self.client = Client(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
            http_client=TwilioHttpClient(timeout=20),
        )

    def start_verification(self, phone):
        self.client.verify.v2.services(
            settings.TWILIO_VERIFY_SERVICE_SID
        ).verifications.create(to=phone, channel="sms")

    def check_verification(self, phone, code):
        return (
            self.client.verify.v2.services(settings.TWILIO_VERIFY_SERVICE_SID)
            .verification_checks.create(to=phone, code=code)
            .status
            == "approved"
        )

    def send(self, phone, body):
        return self.client.messages.create(
            to=phone, from_=settings.TWILIO_FROM_NUMBER, body=body
        ).sid


def provider():
    if settings.SMS_PROVIDER == "twilio":
        return TwilioProvider()
    if settings.SMS_PROVIDER == "mock" and (settings.DEBUG or settings.TESTING):
        return MockProvider()
    raise RuntimeError("SMS disabled")
