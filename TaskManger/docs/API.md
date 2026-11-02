# TaskFlow API

All paths are under `/api/`. Bodies and responses are JSON. Use the same origin as the frontend. Except for account flows, endpoints require a Django session; there is no bearer-token API.

1. `GET auth/csrf/` returns `{ "csrfToken": "..." }` and sets the CSRF cookie.
2. Include `X-CSRFToken` and browser cookies for every POST/PATCH/PUT/DELETE, including anonymous login/register/reset requests.
3. Refresh CSRF after login because Django rotates it. Session cookie is HttpOnly, SameSite=Lax; production requires Secure cookies and HTTPS.

## Accounts

| Method/path | Body / result |
| --- | --- |
| POST `auth/register/` | `username,email,password,timezone?`; creates 7 independent default categories and signs in; returns profile |
| POST `auth/login/` | `identifier,password`; identifier is username or email |
| POST `auth/logout/` | Ends session |
| GET `auth/me/` | Current profile or 401 |
| POST `auth/forgot/` | `email`; generic response for existing/nonexisting addresses |
| POST `auth/reset/` | `uid,token,password`; single-use password-state token, one-hour expiry |
| POST `auth/verify/` | `token`; email-bound signed token, 24-hour expiry |
| POST `auth/resend/` | Authenticated; resends verification |
| PATCH `profile/` | `first_name,timezone,language(en/ar),theme(light/dark/system),email_notifications` |
| POST `phone/` | `action=start,phone(E.164),consent=true`; requests verification |
| POST `phone/` | `action=verify,code`; requires matching phone/session, expires in 10 minutes |
| POST `phone/` | `action=unsubscribe` or `remove`; available without phone verification throttling |

Authentication sensitive actions are rate-limited per IP/action to 12/minute. Phone start/verify are limited to 5/hour per IP/action; verification challenges additionally allow at most five attempts. CSRF/me reads and logout are not counted against authentication attempts. Configure upstream limits too for distributed abuse resistance; DRF cache throttles are approximate under simultaneous requests.

## Tasks

`GET/POST tasks/`, `GET/PATCH/PUT/DELETE tasks/{id}/`. Writes are owner-scoped.

```json
{
  "title": "Leg day",
  "description": "Strength and mobility",
  "category": 1,
  "status": "todo",
  "priority": "high",
  "start": "2026-10-26T16:00:00Z",
  "end": "2026-10-26T17:00:00Z",
  "due": null,
  "all_day": false,
  "date": null,
  "end_date": null,
  "timezone": "Asia/Jerusalem",
  "notes": "Bring water",
  "subtasks": [{"title":"Warm up","done":false}],
  "recurrence": {"frequency":"weekly","count":12},
  "reminder_rules": [{"channel":"in_app","minutes":10},{"channel":"email","minutes":30}]
}
```

Statuses: `todo,in_progress,completed,cancelled`; priorities: `low,medium,high,urgent`. Dates for all-day tasks use `YYYY-MM-DD`; `end_date` is exclusive. Timed fields require ISO datetimes; UTC or explicit offsets are recommended. Null dates allow unscheduled tasks, but reminders/recurrence need a date. `recurrence={}` disables recurrence; selected weekdays use `frequency=weekdays,days=[0,2,4]` (Monday=0). Count is 2–366. Reminders have one channel per rule (`in_app,email,sms`) and either `minutes` or absolute `at` with offset; add multiple rules to use multiple channels. Maximum 12 rules and 100 checklist entries.

Response adds `id,series,occurrence,version,created_at,updated_at,completed_at`. PATCH/PUT/DELETE must include `version`. Optional `scope` is `one` (default), `future`, or `series`. For future/series include `scope_versions`, a mapping from every affected task ID to the version you loaded. Any stale or missing version yields 409, without partial writes. Change the entire recurrence rule from occurrence 0; future rule changes branch into a new series and preserve the past.

Filters: `?search=...&status=todo&priority=high&category=1&ordering=due`. Allowed ordering: `due,start,title,-created_at,priority`. Personal-workspace lists are not paginated in this version.

## Categories

`GET/POST categories/`, `GET/PATCH/PUT/DELETE categories/{id}/`.

Fields: `name,color` (six-digit hex), `icon`. Names are unique within an account. DELETE requires `{ "replacement": null }` or another owned category ID. Tasks remain and their versions increase.

## Notifications and delivery history

- `GET notifications/` and `GET notifications/{id}/`
- `POST notifications/{id}/read/`
- `POST notifications/read_all/`
- `GET reminders/` and `GET reminders/{id}/` return the current user's reminder attempts/states, not another user's data.

## WebSocket

Connect to `/ws/updates/` with the existing session cookie and an allowed Origin. No subscription/user ID is accepted from clients. Events are invalidations, e.g. `{"type":"tasks.changed"}`, `categories.changed`, `notifications.changed`. Re-fetch the relevant owner-scoped resources. Reconnect with backoff and refetch on every successful reconnect. Events contain no task content.

## Errors

400 validation (field errors or detail), 401 anonymous profile, 403 authentication/CSRF, 404 inaccessible object, 409 stale version, 429 rate limit, 503 unavailable mail/verification provider. Display errors and retain unsaved form state. For a 409 close/reopen the editor to load the newest data, then reapply your changes.
