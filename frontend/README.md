# Frontend

Browser-facing SproutSync applications live here.

## Dashboard

[`dashboard/`](./dashboard/) is the React, Vite, TypeScript, and Tailwind
operator interface.

```powershell
npm.cmd run dev
```

The Vite development server runs at `http://localhost:5173` and proxies
`/api` requests to the local backend at `http://localhost:8000`.

Keep UI-only code in this area. API contracts belong in
[`../packages/contracts/`](../packages/contracts/), and backend behavior
belongs in [`../backend/`](../backend/).
