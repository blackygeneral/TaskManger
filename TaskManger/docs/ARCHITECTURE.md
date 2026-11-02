# Architecture and operational semantics

## Boundaries

`accounts` owns the custom User, preferences, sessions, verification and phone consent. `categories` owns per-user classification. `tasks` owns task occurrences, optimistic versions and recurrence expansion. `notifications` owns durable reminders, delivery state, inbox items, provider adapters and Channels invalidations. `config` composes Django, ASGI and Celery.

React uses TanStack Query as the server-data cache. Mutations invalidate data instead of appending duplicate objects. All views derive from this cache. WebSockets invalidate it after commits; reconnect/focus and a 60-second fallback poll compensate for lost invalidations. A transport outage does not undo a successful database mutation. The simple live/reconnecting indicator reflects the WebSocket transport.

## Ownership and concurrency

Every API queryset is scoped to the session user. Related category IDs are validated against that same user's categories. Background jobs derive the owner from the stored task, never from a client-provided user ID. A WebSocket joins only `user_{authenticated_id}` and cannot select another group. Origin must exactly match configured trusted origins.

Task writes require the loaded integer version and obtain row locks. Updates increment the version; stale writes fail with 409. Series/future writes additionally require a snapshot of every affected occurrence's version. The editor freezes that snapshot when opened. Category transfer also increments affected task versions. Events use transaction.on_commit.

## Recurrence and timezone policy

Recurrence is finite, with at most 366 materialized occurrences. Daily/weekly/selected weekday rules are interpreted in the task's IANA zone. Occurrence 0 is the requested date; later selected-weekday occurrences follow the selected weekday set. UTC timestamps represent instants; recurrence advances local calendar dates and keeps wall-clock time, so the UTC offset can change at DST.

A nonexistent future recurring wall time at the spring-forward boundary moves forward by the transition gap. For newly typed invalid wall times the browser displays an error rather than silently accepting them. Repeated fall-back wall times use the earlier instant in the frontend. Existing instants remain explicit UTC values. All-day tasks have independent date and exclusive end_date fields; timezone conversion never moves their calendar date. All-day reminder anchor is 09:00 in the task zone.

- `one`: modifies only that occurrence.
- `future`: modifies that and later materialized occurrences; date changes are shifted relative to the selected occurrence.
- `series`: modifies all occurrences. Changing the entire rule requires opening occurrence 0.
- Changing the recurrence rule regenerates the chosen branch with a new series identity, deletes the superseded future occurrences/reminders, and preserves past occurrences for future scope.
- Disabling recurrence retains the selected task and removes the affected generated branch.
- Calendar drag/resize uses `one`. Other fields and recurrence scope are available in the editor.

Recurring tasks are intentionally not infinite. Increase/recreate a finite branch when more occurrences are needed. Custom reminder datetimes are shifted when initially expanding a recurrence; subsequent custom times are explicit absolute instants.

## Reminder delivery state machine

The database stores each rule's scheduled delivery, channel, unique identity, state, attempts, safe error class, provider ID and accepted timestamp. Identity hashes task ID, rule position, channel and original UTC delivery time. Editing a title does not resend an already accepted reminder. Rescheduling cancels superseded pending attempts and creates a distinct identity. Completion/cancellation cancels pending retries. Deletion cascades reminders and detaches retained inbox notifications from the task.

One Celery beat emits a scan every 30 seconds. The scan enqueues up to 200 due IDs. The worker locks the task, reminder and user, then rechecks status, email verification/preferences or phone verification/consent immediately before provider submission. Concurrent workers serialize on these locks and skip already processed reminders. Inbox records have a unique OneToOne reminder relation.

States:

- `pending`: due work waiting for scan.
- `retry`: temporary failure, rescheduled with 2^attempt minutes (2, 4, 8).
- `created`: in-app notification committed.
- `accepted`: SMTP/Twilio accepted the request; not proof of recipient delivery.
- `simulated`: local SMS adapter completed without sending.
- `cancelled`: obsolete schedule, completed task, revoked permission, or more than 24 hours late.
- `failed`: four attempts exhausted.

Every scan checks durable records, so broker loss/worker restart does not permanently lose pending reminders. Retries are scheduled in the database; no long-lived Celery ETA is needed. The 24-hour late cutoff applies to the next scheduled attempt. Keep one beat instance, but duplicate scans are safe at the database layer.

Exactly-once external delivery cannot be guaranteed: a worker/process/database failure after SMTP/Twilio accepts but before commit can cause a retry and duplicate external message. The app minimizes duplication with locks and unique identities, but does not claim provider-side idempotency or confirmed delivery. An unsubscribe cannot recall a request already accepted by a provider. No delivery webhooks are exposed. Do not configure provider callbacks to nonexistent endpoints.

## Operational limits

Personal-workspace API lists are currently unpaginated; do not use this version for huge shared/team task stores without pagination and load testing. Multi-region deployment and provider delivery receipts are out of scope. Notifications/settings are translated, while arbitrary task/category content and server validation details retain their original text. The production bundle includes Material UI and form/translation dependencies; the calendar is loaded separately.

Production must use PostgreSQL and Redis. In-memory channel layers and SQLite are only test/development fallbacks. Mailpit and mock SMS are local-only. The default Compose stack is bound to loopback and has no external deployment action.
