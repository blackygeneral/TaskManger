# Validation record

Validated locally on 2026-10-26 and 2026-10-27. No external deployment, real SMS, or externally relayed email was performed.

| Check | Actual result |
| --- | --- |
| Django system checks | Passed; no issues |
| Migration generation check | Passed; no changes detected |
| Migrations on PostgreSQL | Applied successfully, both native/local and Compose PostgreSQL |
| Django backend suite | 23 tests passed on PostgreSQL |
| Frontend unit/component suite | 8 tests passed |
| TypeScript | Passed as part of `npm run build` |
| ESLint | Passed |
| Python Ruff undefined/unused symbol checks | Passed |
| Vite production build | Passed; separate UI, React, form and lazy calendar chunks, no large-chunk warning |
| Docker Compose configuration | Passed |
| Docker images and full service startup | Built and started successfully, migrations finished before application services |
| Django `check --deploy` | Passed with DEBUG=false, mock SMS disabled and a nonsecret validation-only key |
| Nginx production image | Built successfully |
| Compiled SPA smoke test through Nginx | English and Arabic registration form rendered with no browser page errors |
| Playwright application workflow | Passed |
| Playwright actual beat/worker reminder workflow | Passed |

## Backend coverage

Registration/default categories, username/email login, logout, anonymous login CSRF enforcement, weak passwords, case-insensitive username uniqueness, email verification, password-reset token reuse rejection, authentication throttling, task CRUD and stale versions, ownership isolation, category ownership and transfer, all-day dates, daily recurrence across DST, selected weekdays, future/one/series behavior, recurrence regeneration, reminder rescheduling and cancellation, clearing a schedule, no repeat delivery after title changes, retry/backoff/exhaustion, late-work cutoff, email verification/preferences, SMS consent/verification/unsubscribe/number change, persisted notification isolation, post-commit events, WebSocket authentication/Origin/owner-group isolation, and two concurrent PostgreSQL delivery threads creating only one notification. A stale sibling version rejects a series-wide edit.

Unit tests use in-memory channels/cache to isolate dependencies. The PostgreSQL concurrency test uses real row locks. Full browser integration uses the running Compose Redis, PostgreSQL, Daphne, Celery worker, beat and Mailpit.

## Browser workflow

1. Register a unique account, open its local Mailpit verification link and verify email.
2. Sign out and sign back in using email.
3. Create a category and an all-day task with checklist and reminder.
4. Keep a second page open and observe creation and edits through WebSockets.
5. Open the task from the calendar, edit its title, drag it to the next date and check persisted API date.
6. Complete it from the second page; verify the first page's completed statistic.
7. Switch to dark appearance and Arabic; verify RTL.
8. Use a 390×844 viewport, mobile navigation, and check there is no horizontal overflow.
9. Assert no page-level JavaScript exceptions.

The separate worker integration test registers/verifies an account, verifies a simulated phone, creates an immediately due task with three channels, waits for the real periodic scan and worker, and verifies `accepted` email in Mailpit, `created` inbox entry and `simulated` SMS. It does not infer recipient delivery from provider acceptance.

Screenshots and traces are generated under ignored `frontend/test-results/`. `frontend/e2e/taskflow.spec.ts` contains the reproducible integration checks. The production Nginx check validates rendering/bundle loading; it is not a claim that an external TLS deployment was tested.

## Issues found and resolved

- Updated component usage for the installed Material UI APIs.
- Excluded CSRF/profile reads from authentication-attempt rate limits, and kept unsubscribe/remove available independently of phone verification throttling.
- Preserved the calendar event list and component/callback identity across unrelated renders so dragging after editor updates reliably persists.
- Preserved task versions while an editor is open, including editors opened by deep links; froze series-version snapshots.
- Keyed query data and WebSocket lifecycle by account identity.
- Used stable reminder identity so title edits do not repeat accepted reminders.
- Added DST-aware due-time movement with calendar drag.
- Tests wait for asynchronous server-confirmed checkbox state and modal dismissal instead of assuming synchronous UI updates.

## External verification and limits

Twilio Verify/Messaging and a production SMTP provider were not called: they require the user's credentials, sender configuration and an explicitly controlled live test. HTTPS/reverse-proxy configuration, backup restoration, load testing and deployment-specific security review remain deployment responsibilities. SMTP/Twilio have an unavoidable failure window after provider acceptance but before database commit; exactly-once external delivery is not claimed. Recurrence is finite (maximum 366 occurrences). API lists are unpaginated for personal workspaces. See `ARCHITECTURE.md` and the production section of `README.md`.
