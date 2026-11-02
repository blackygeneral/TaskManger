# TaskFlow frontend

React and TypeScript with Vite, Material UI, React Router, TanStack Query,
React Hook Form/Zod, FullCalendar and i18next (English/Arabic with RTL).

See the [root README](../README.md) for the complete backend, database, Redis,
Mailpit and environment setup. The frontend alone does not provide the API.

From this directory, with Node 24+ and npm installed:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Vite proxies `/api` and `/ws` to `http://127.0.0.1:8000` by default. Set
`API_PROXY` in the shell launching Vite to use another backend. Never put
server credentials in frontend variables or `VITE_*` variables.

Existing commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite development server |
| `npm run build` | TypeScript check and production bundle |
| `npm run preview` | Local preview of an existing production build |
| `npm run lint` | ESLint on TypeScript source |
| `npm test` | Vitest unit/component tests |
| `npm run e2e` | Playwright integration tests; requires the full local stack |

Keep `package-lock.json` committed. `node_modules`, `dist` and browser-test
artifacts are generated and ignored. `starter/` contains retained legacy
scaffolding, not the active entry point; the app starts at `src/main.tsx`.
