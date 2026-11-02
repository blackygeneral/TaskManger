from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.contrib.auth import get_user_model
from categories.models import Category
from tasks.models import Task
from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = "Create local demo data for an existing account (never creates credentials)"

    def add_arguments(self, parser):
        parser.add_argument("username")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Development only")
        user = get_user_model().objects.get(username=options["username"])
        for i, (title, name) in enumerate(
            [
                ("Leg day · strength & mobility", "Gym"),
                ("Prepare a nourishing dinner", "Cooking"),
                ("Plan the next product milestone", "Work"),
                ("Read a chapter and take notes", "Study"),
            ]
        ):
            category, _ = Category.objects.get_or_create(owner=user, name=name)
            Task.objects.get_or_create(
                owner=user,
                title=title,
                defaults={
                    "category": category,
                    "start": timezone.now() + timedelta(hours=i),
                    "due": timezone.now() + timedelta(hours=i + 1),
                    "subtasks": [{"title": "Prepare everything", "done": False}],
                },
            )
        self.stdout.write(self.style.SUCCESS("Demo tasks ready"))
