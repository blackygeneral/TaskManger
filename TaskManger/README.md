# TaskFlow

A personal task workspace built with Django 5.2 LTS, Django REST Framework, PostgreSQL, Channels, Redis, Celery, React, TypeScript, Vite, and Material UI. English and Arabic/RTL are included. All statistics come from the authenticated user's tasks.


## Repository layout

```text
backend/
  accounts/        Users, authentication, preferences and phone verification
  categories/      Per-user categories
  tasks/           Tasks, recurrence, migrations and demo-data command
  notifications/   Reminder jobs, delivery providers, inbox and WebSockets
  config/          Django settings, URLs, ASGI and Celery
  backend/         Retained empty legacy Django scaffold (not installed)
  manage.py
  requirements.txt # Pinned Python dependencies
frontend/
  src/             Active TypeScript application and component tests
  e2e/             Playwright integration tests
  public/          Public assets retained from the initial scaffold
  starter/         Retained legacy Vite scaffold; not used by index.html
  package.json
  package-lock.json
  vite.config.ts
  nginx.conf
scripts/compose    Optional wrapper for Docker Compose
compose.yaml       Local multi-service stack
.env.example       Safe, local-only environment template
docs/              API, architecture and historical validation notes
```

The active frontend entry point is `frontend/src/main.tsx`; the backend starts
through `backend/manage.py` or `config.asgi:application`. Django migrations,
both dependency manifests, the frontend lockfile, Dockerfiles and application
assets belong in version control. Local databases, uploaded data, credentials,
virtual environments, dependencies, build output and test traces do not.

## Prerequisites

For the container setup, install Docker Engine and Docker Compose v2 and ensure
your user can access Docker. No host Python or Node installation is needed.
The optional `scripts/compose` wrapper needs Bash; its Linux x86_64 download
fallback also needs `curl`, `sha256sum`, `cut`, `mktemp` and `install`.

For native development, use Python 3.14, Node 24+ with npm, PostgreSQL 18,
Redis 7 and Mailpit, matching the existing Dockerfiles and service configuration.
Redis is required even for registration/login because it stores rate limits.

## Run on Linux with Docker Compose

Prerequisites: Docker Engine and the Docker Compose v2 plugin, with permission to access Docker. Ports 5173, 8000, 8025 and 1025 must be available.

```bash
test -f .env || cp .env.example .env
# .env.example contains development placeholders, not production credentials.
docker compose up -d --build
docker compose ps
```

If the Compose plugin is missing on Linux x86_64 use `./scripts/compose up -d --build` instead. The wrapper uses an installed Compose when available, otherwise downloads a pinned official binary to `/tmp` and verifies its SHA-256. Replace `docker compose` with `./scripts/compose` in the commands below.

The one-shot `migrate` service applies migrations before ASGI, the worker and beat start. Open **http://localhost:5173**, register an account, and open the verification email in **http://localhost:8025** (Mailpit). Mailpit captures email locally; it does not relay messages externally. SMS defaults to a clearly labeled local simulation; its verification code is `000000`.

| Service | Local URL |
| --- | --- |
| Application | http://localhost:5173 |
| API | http://localhost:8000/api/ |
| Django admin | http://localhost:8000/admin/ |
| Mailpit inbox | http://localhost:8025 |
| Mailpit SMTP | localhost:1025 |
| WebSocket through Vite | ws://localhost:5173/ws/updates/ |

Use `localhost` consistently for session cookies. Vite proxies `/api` and `/ws` to Django, so browser requests are same-origin and use Django session cookies and CSRF. No authentication tokens are stored in localStorage. Only language and appearance preferences are stored there.

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo YOUR_REGISTERED_USERNAME
docker compose logs -f backend worker beat
docker compose down
```

`down` retains data volumes. Do not add `-v` unless you deliberately want to delete your local data. To rebuild after source changes, run `docker compose up -d --build`. The original Vite starter files are preserved in `frontend/starter`; the original empty Django app remains in `backend/backend` and is not installed.

## Environment configuration

The root `.env.example` is a **Compose** template: `db`, `redis` and `mailpit`
are container service names. Copy it to an ignored `.env` without overwriting
an existing local file. Its public development password and secret are not
production credentials. The native setup below uses localhost equivalents.
Django does not load `.env` automatically; Compose injects it through `env_file`.

| Variables | Purpose |
| --- | --- |
| `DEBUG`, `SECRET_KEY` | Development mode and Django signing secret. Use a unique secret of at least 50 characters in production. |
| `DATABASE_URL` | PostgreSQL connection URL, including database credentials; URL-encode special characters in credentials. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose database initialization. Match the values in `DATABASE_URL`. Changing these does not rewrite an existing database volume. |
| `REDIS_URL` | Shared cache/rate limits, Channels and Celery broker. |
| `PUBLIC_URL` | Frontend URL used in account and reminder links. |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` | Comma-separated Django hosts and allowed browser origins. |
| `EMAIL_HOST`, `EMAIL_PORT` | SMTP endpoint; Mailpit is the local default. |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | SMTP authentication, transport security and sender. Credentials can stay empty for Mailpit. |
| `EMAIL_BACKEND` | Optional Django mail backend override; defaults to SMTP. |
| `SMS_PROVIDER` | `mock` for local simulation, `disabled`, or `twilio`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_VERIFY_SERVICE_SID` | Needed only for real Twilio integration; leave empty for local simulation. |
| `TRUST_PROXY_HTTPS` | Enable only behind a trusted TLS proxy that replaces forwarded headers. |
| `TESTING` | Isolated-test option only; do not enable in normal development or production. |
| `API_PROXY` | Optional shell environment for Vite; defaults to `http://127.0.0.1:8000`. Compose sets `http://backend:8000`. |
| `E2E_URL`, `MAILPIT_URL`, `MAILPIT_DETAIL_URL` | Optional Playwright endpoint overrides; examples below target the Compose stack. |

Never commit real `.env` files, credentials, local database files or browser-test
traces. Do not put secrets in `VITE_*` variables: those values can be embedded
in browser bundles. The existing local-only secret and test passwords in source
are explicit development/test fixtures; production requires separate secrets.

## Development without Docker for the application

Install Python 3.14, Node 24+, PostgreSQL 18, Redis 7 and Mailpit. Create a PostgreSQL database and role of your choice. Keep these services running. The application does not require changing source code to use them.

```bash
python -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend ci

export DEBUG=true
export SECRET_KEY='local-only-taskflow-development-secret'
export DATABASE_URL='postgresql://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/taskflow'
export REDIS_URL='redis://127.0.0.1:6379/0'
export EMAIL_HOST=127.0.0.1
export EMAIL_PORT=1025
export PUBLIC_URL=http://localhost:5173
export CSRF_TRUSTED_ORIGINS=http://localhost:5173
export SMS_PROVIDER=mock
backend/.venv/bin/python backend/manage.py migrate
backend/.venv/bin/python backend/manage.py collectstatic --noinput
```

Run the following in separate terminals with the same exported environment:

```bash
cd backend
.venv/bin/daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

```bash
cd backend
.venv/bin/celery -A config worker -l INFO --concurrency=2
```

```bash
cd backend
.venv/bin/celery -A config beat -l INFO --schedule=/tmp/taskflow-celerybeat
```

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Django reads environment variables; it does **not** automatically source `.env` outside Compose. SQLite is available only as a development/test fallback when `DATABASE_URL` is absent. Use PostgreSQL for actual multi-worker reminder processing; SQLite cannot validate row-lock concurrency guarantees.

## Available checks and tests

```bash
docker compose exec -e TESTING=true backend python manage.py check
docker compose exec -e TESTING=true backend python manage.py makemigrations --check --dry-run
docker compose exec -e TESTING=true backend python manage.py test accounts tasks
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
cd frontend
npx playwright install chromium
MAILPIT_URL=http://localhost:8025/api/v1/messages \
MAILPIT_DETAIL_URL=http://localhost:8025/api/v1/message npm run e2e
```

The E2E test requires the full stack and Mailpit. It creates unique test accounts and local messages; use a disposable local database. `TESTING=true` replaces Redis caches/channel layers with in-memory versions for isolated unit tests and must never be set in production. Browser tests exercise real Redis, PostgreSQL and WebSockets. See [historical verification results](docs/VALIDATION.md); that document records earlier runs, not a fresh guarantee for every checkout. No tests or builds were run as part of the repository-cleanup pass.

## Features and behavior

- Session authentication; username/email login; email verification; one-hour password reset links; case-insensitive unique email and username; shared Redis rate limits.
- Separate per-account default categories, editable names/colors/icons; category deletion explicitly transfers or clears the category without deleting tasks.
- Task editor with priority, status, dates, description, notes, checklist, multiple reminder channels and finite recurrence.
- Overview, searchable/filterable/sortable cards, Kanban with drag/drop and keyboard-accessible status selectors, and FullCalendar month/week/day/agenda views.
- Calendar drag/resize saves to the API and reverts on failure. Calendar edits affect one occurrence; open the editor for future/series scope.
- Optimistic concurrency: every task write/delete needs its current version. Multi-occurrence changes require versions for every affected occurrence. Stale edits return 409.
- Owner-only WebSocket groups, explicit Origin allowlist, session authentication, transaction-on-commit events, reconnect/backoff/refetch, and periodic fallback refetch. Query invalidation avoids duplicate records.
- Persistent notification inbox with unread count, read actions and task links.
- Optional phone verification and explicit consent, change/remove/unsubscribe controls; no phone is required for the rest of the application.

## Recurrence, dates and reminders

Read [architecture and delivery policies](docs/ARCHITECTURE.md). Recurrence is intentionally finite: daily, weekly or selected weekdays, with 2–366 occurrences created in one transaction. Each occurrence is a real task, not a client-only calendar projection. All-day dates have independent DateFields and exclusive end dates. Timed values are stored in UTC; account/task IANA zones preserve calendar wall time across DST. All-day reminder offsets are relative to 09:00 in the task zone.

## SMTP and SMS

Development uses Mailpit. For external SMTP, configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS=true`, and a verified `DEFAULT_FROM_EMAIL`. Users must verify their email and enable email reminders. Production SMTP delivery was not tested against an external provider.

For Twilio set:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_SECRET_TOKEN
TWILIO_VERIFY_SERVICE_SID=YOUR_VERIFY_SERVICE_SID
TWILIO_FROM_NUMBER=YOUR_SMS_CAPABLE_NUMBER
```

Verify uses Twilio Verify; reminders use the Messaging API. Obtain the appropriate provider permissions, sender registration and balance for your region. Alternatively set `SMS_PROVIDER=disabled`. Mock SMS is rejected when `DEBUG=false`. No SMS webhook endpoint is exposed or used; consequently no unsigned webhook is accepted and provider delivery receipts are not reported. The UI calls SMTP/Twilio success **accepted**, never **delivered**. `simulated` is a separate status.

## Production preparation

This Compose file is a local development configuration, not an internet-facing deployment. Before production:

1. Set `DEBUG=false`, remove `TESTING`, generate a strong random `SECRET_KEY` (at least 50 characters), and use real PostgreSQL credentials. Store secrets outside version control.
2. Set exact `ALLOWED_HOSTS`, HTTPS `PUBLIC_URL` and `CSRF_TRUSTED_ORIGINS`. Terminate TLS on a trusted reverse proxy. Set `TRUST_PROXY_HTTPS=true` only when that proxy strips incoming forwarded headers and sets `X-Forwarded-Proto` itself.
3. Build the `production` stage of `frontend/Dockerfile`; it serves the compiled SPA with Nginx and proxies API/WebSockets to ASGI. Adapt `frontend/nginx.conf` for your TLS proxy. Run `collectstatic` and mount its output at `/staticfiles` in Nginx for Django admin.
4. Run Daphne, Redis, PostgreSQL, Celery workers and **exactly one beat scheduler** under your process/container supervisor. Keep Redis persistence and database backups. PostgreSQL is the source of truth for reminders; the periodic scan recovers due work after broker/worker restarts.
5. Configure SMTP and Twilio, or explicitly disable SMS. Test consent/verification with your provider before enabling real sends. Do not publish Mailpit, Redis, database ports or development Vite externally.
6. Run `python manage.py check --deploy` in the production environment, configure monitoring and backups, and perform your deployment-specific load/security review.

Official references consulted: [Django versions](https://www.djangoproject.com/download/), [Celery periodic tasks](https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html), [FullCalendar time zones](https://fullcalendar.io/docs/timeZone). Exact installed package versions are pinned in `backend/requirements.txt` and `frontend/package-lock.json`.

## Troubleshooting HTML/JSON errors during registration

`Unexpected token '<'` means an API request received an HTML page. The client now reports the endpoint and HTTP status instead of attempting to parse HTML. A missing Redis instance causes login/registration rate limiting to fail; API requests return JSON with status 503 rather than bypassing that protection.

When running Django/Vite directly on the host with the default `REDIS_URL=redis://localhost:6379/0`, Redis must also be reachable there. A loopback-only local service can be started with:

```bash
docker run -d --name taskflow-local-redis --restart unless-stopped \
  -p 127.0.0.1:6379:6379 -v taskflow_local_redis_data:/data \
  redis:7-alpine redis-server --appendonly yes
# On later runs, if the container already exists:
docker start taskflow-local-redis
```

The full Compose stack uses its internal `redis` service instead and does not need this extra container. Do not run another Redis on port 6379 if that port is already occupied. After backend code changes, restart a server that does not support automatic reload.
