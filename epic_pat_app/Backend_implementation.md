# Plan: Add Express Backend + PostgreSQL to Epic Patient App

## Context
The app is currently a pure frontend Svelte 5 SPA that communicates directly with Epic's FHIR API.
OAuth tokens live in `localStorage`, FHIR calls are made from the browser, and nothing is persisted.
The goal is to add an Express backend that:
1. Takes over the PKCE OAuth flow (tokens never touch the browser)
2. Proxies all FHIR requests server-side
3. Persists every FHIR resource to PostgreSQL after fetching it

---

## Final Architecture

```
Browser (Svelte SPA) ──► nginx :80 ──► /api/** ──► Express :3000 ──► Epic FHIR API
                                                          │
                                                          └──► PostgreSQL :5432
```

Docker Compose services: `frontend` (nginx), `backend` (Node/Express), `db` (Postgres 16).

---

## Step-by-Step Implementation

### Step 1 – Scaffold the backend
Create `backend/` inside the project root:
```
backend/
├── src/
│   ├── index.ts          # Express entry point
│   ├── routes/
│   │   ├── auth.ts       # OAuth PKCE endpoints
│   │   └── fhir.ts       # FHIR proxy + persist endpoints
│   ├── db/
│   │   ├── client.ts     # node-postgres pool
│   │   ├── migrate.ts    # runs migrations on startup
│   │   └── migrations/
│   │       └── 001_init.sql
│   └── types/
│       └── fhir.ts       # shared FHIR interfaces (from store.ts)
├── Dockerfile
├── package.json
└── tsconfig.json
```

**`backend/package.json` dependencies:**
- `express`, `cors`, `cookie-parser`, `uuid`
- `axios`, `pkce-challenge`
- `pg` (node-postgres)
- `dotenv`

**Dev deps:** `typescript`, `ts-node`, `@types/express`, `@types/pg`, `@types/node`, `@types/cookie-parser`, `nodemon`

---

### Step 2 – Database schema (`001_init.sql`)

Hybrid approach: relational key columns + `raw JSONB` for the full FHIR resource.

```sql
CREATE TABLE IF NOT EXISTS patients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id      TEXT UNIQUE NOT NULL,
  first_name   TEXT,
  last_name    TEXT,
  birth_date   DATE,
  gender       TEXT,
  mrn          TEXT,
  raw          JSONB,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id          TEXT UNIQUE NOT NULL,
  patient_epic_id  TEXT NOT NULL REFERENCES patients(epic_id) ON DELETE CASCADE,
  category         TEXT NOT NULL,   -- 'vital-signs' | 'laboratory'
  code_text        TEXT,
  effective_date   TIMESTAMPTZ,
  value_quantity   NUMERIC,
  value_unit       TEXT,
  value_string     TEXT,
  status           TEXT,
  interpretation   TEXT,
  raw              JSONB,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medication_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id          TEXT UNIQUE NOT NULL,
  patient_epic_id  TEXT NOT NULL REFERENCES patients(epic_id) ON DELETE CASCADE,
  medication_name  TEXT,
  status           TEXT,
  dosage_text      TEXT,
  authored_on      DATE,
  prescriber       TEXT,
  raw              JSONB,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Ephemeral OAuth state: PKCE verifier keyed by state param
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Session: maps browser session ID → Epic access token
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_epic_id TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Step 3 – Auth routes (`backend/src/routes/auth.ts`)

| Endpoint | What it does |
|----------|-------------|
| `GET /api/auth/login` | Generates PKCE pair, stores `{state → code_verifier}` in `oauth_states`, returns Epic authorize URL |
| `POST /api/auth/callback` | Receives `{code, state}` from frontend, fetches verifier from DB, exchanges with Epic for access token, creates session row, sets `HttpOnly` session cookie |
| `POST /api/auth/logout` | Deletes session row, clears cookie |
| `GET /api/auth/me` | Returns `{patientId}` for the current session (used by frontend on load) |

---

### Step 4 – FHIR proxy routes (`backend/src/routes/fhir.ts`)

All routes require a valid session cookie middleware (`requireSession`).

| Endpoint | FHIR call | Persists to |
|----------|-----------|-------------|
| `GET /api/fhir/patient` | `Patient/{id}` | `patients` (upsert) |
| `GET /api/fhir/vitals` | `Observation?category=vital-signs` | `observations` (upsert each) |
| `GET /api/fhir/labs` | `Observation?category=laboratory` | `observations` (upsert each) |
| `GET /api/fhir/medications` | `MedicationRequest` | `medication_requests` (upsert each) |

Each handler:
1. Looks up access token via session cookie → DB
2. Makes FHIR request with Bearer token
3. Upserts results into Postgres (`ON CONFLICT (epic_id) DO UPDATE`)
4. Returns data as JSON to frontend

---

### Step 5 – Update the frontend

**Files to modify:**

- **`src/config.ts`** – remove all Epic OAuth/FHIR URLs; add `API_BASE = '/api'`
- **`src/App.svelte`** – replace direct PKCE logic with calls to `GET /api/auth/login` (redirect) and `POST /api/auth/callback`; replace `localStorage` token with session cookie check via `GET /api/auth/me`
- **`src/lib/fhir.ts`** – replace direct Epic FHIR calls with calls to `/api/fhir/*`; remove Bearer token header (handled by cookies)
- **`src/lib/store.ts`** – remove `token` store; no other changes needed

**`vite.config.ts`** – add dev proxy so `/api` forwards to `http://localhost:3000` during `npm run dev`:
```ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

---

### Step 6 – Docker updates

**`backend/Dockerfile`** (new):
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**`nginx.conf`** – add upstream proxy block so `/api` requests are forwarded to the backend container:
```nginx
location /api/ {
  proxy_pass http://backend:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

**`docker-compose.yml`** – update to three services:
```yaml
services:
  frontend:
    build: .
    ports: ["5173:80"]
    depends_on: [backend]

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgres://postgres:postgres@db:5432/epic_app
      SESSION_SECRET: changeme
      EPIC_CLIENT_ID: 4268a20b-9eb5-4baa-a735-b257f87d6100
      EPIC_FHIR_BASE_URL: https://fhir.epic.com/.../api/FHIR/R4/
      EPIC_AUTH_URL: https://fhir.epic.com/.../oauth2/authorize
      EPIC_TOKEN_URL: https://fhir.epic.com/.../oauth2/token
      REDIRECT_URI: http://localhost:5173/
    depends_on: [db]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: epic_app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

**`.env.example`** (new) – document all required environment variables.

---

## Critical Files

| Path | Change |
|------|--------|
| `src/config.ts` | Remove Epic URLs, add `API_BASE = '/api'` |
| `src/App.svelte` | Replace OAuth logic with backend API calls |
| `src/lib/fhir.ts` | Point all FHIR calls to backend |
| `vite.config.ts` | Add `/api` dev proxy |
| `nginx.conf` | Add `/api/` upstream proxy block |
| `docker-compose.yml` | Add `backend` + `db` services |
| `backend/` (new) | Entire backend project |

---

## Verification

1. `docker compose up --build` — all 3 containers start, backend logs "DB migrated", "Listening on :3000"
2. Navigate to `http://localhost:5173/` → login button visible
3. Click login → redirected to Epic sandbox OAuth page (URL contains `client_id` and `code_challenge`)
4. Complete Epic auth → redirected back to app, Dashboard loads with patient data
5. Connect to DB: `docker compose exec db psql -U postgres epic_app`
   - `SELECT epic_id, first_name, last_name FROM patients;` → row present
   - `SELECT count(*) FROM observations;` → rows present
   - `SELECT count(*) FROM medication_requests;` → rows present
6. Refresh page → data still shows (session cookie persists)
