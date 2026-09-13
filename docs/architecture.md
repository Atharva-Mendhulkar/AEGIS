# Architecture

The project is a Python-first monorepo:

| Area | Responsibility |
|---|---|
| `core/aegis_core` | Pure domain models, search, risk, compliance, Pareto filtering |
| `services/api` | FastAPI auth, validation, routes, metrics and WebSockets |
| `sdk/aegis_sdk` | One-to-one typed HTTP client |
| `frontend` | Next.js dashboard for frontier, map, and disruption feed |

A graph is held in memory per API process and reconstructed into a per-run adjacency list—there is deliberately no graph database.

## API reference

All routes are prefixed `/v1` and require `X-API-Key`, except the WebSocket handshake policy that should be finalized before production.

| Method | Route | Result |
|---|---|---|
| POST | `/graph` | validate/store depots and routes |
| POST | `/shipments` | validate/store shipments |
| POST | `/plan` | generate candidate plans |
| POST | `/disrupt` | append a disruption event |
| POST | `/plan/{id}/replan` | plan on post-event topology |
| POST | `/plan/aegis-trace` | stage-by-stage pipeline trace |
| GET | `/pareto` | non-dominated plans |
| WS | `/stream/simulation` | simulation lifecycle events |
| GET | `/metrics` | Prometheus exposition |
