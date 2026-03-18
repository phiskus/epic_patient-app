# Backend Implementation Plan — Epic Patient App

## Goal
Add a Node/Express backend and PostgreSQL database to the Svelte SPA.
Three core objectives:
1. **Security** — move PKCE OAuth token exchange server-side; tokens never touch the browser
2. **Persistence** — store all FHIR resources in PostgreSQL as a local cache
3. **Efficiency** — minimize data transfer with Epic using FHIR conditional requests and delta-sync

---

## Software Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                         EPIC PATIENT APP — SYSTEM ARCHITECTURE                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  ┌───────────────────────────────────────────────────────────────────────────┐
  │                         Browser (Svelte 5 SPA)                            │
  │                                                                           │
  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  ┌──────────────────┐   │
  │  │ App.svelte │  │ PatientCard │  │VitalsCard │  │ MedicationsCard  │   │
  │  │  (auth)    │  │             │  │ LabsCard  │  │                  │   │
  │  └────────────┘  └─────────────┘  └───────────┘  └──────────────────┘   │
  │        │                 └──────────────┬──────────────────┘             │
  │   /api/auth/*              /api/fhir/*  │  HTTP + HttpOnly session cookie│
  └────────┼────────────────────────────────┼───────────────────────────────┘
           │                                │  port 5173
           ▼                                ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │                              nginx :80                                    │
  │                                                                           │
  │   /         →  serve /usr/share/nginx/html  (built Svelte dist/)         │
  │   /api/*    →  proxy_pass http://backend:3000                            │
  └───────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │                          Express Backend :3000                            │
  │                                                                           │
  │  ┌──────────────────────────┐   ┌──────────────────────────────────────┐ │
  │  │       Auth Router        │   │           FHIR Router                │ │
  │  │                          │   │                                      │ │
  │  │ GET  /api/auth/login     │   │ GET /api/fhir/patient                │ │
  │  │   └─ build PKCE + state  │   │ GET /api/fhir/vitals                 │ │
  │  │   └─ store in oauth_states│  │ GET /api/fhir/labs                   │ │
  │  │   └─ return redirect URL │   │ GET /api/fhir/medications            │ │
  │  │                          │   │   └─ all delegate to SyncService     │ │
  │  │ POST /api/auth/callback  │   └──────────────────┬───────────────────┘ │
  │  │   └─ load verifier from DB│                     │                     │
  │  │   └─ exchange code→token │                      │                     │
  │  │   └─ persist session     │                      ▼                     │
  │  │   └─ set HttpOnly cookie │  ┌─────────────────────────────────────┐  │
  │  │                          │  │            SyncService              │  │
  │  │ POST /api/auth/logout    │  │                                     │  │
  │  │ GET  /api/auth/me        │  │  Called on every FHIR data request  │  │
  │  └──────────────────────────┘  │                                     │  │
  │                                │  Step 1 — Patient (ETag check)      │  │
  │                                │  ┌───────────────────────────────┐  │  │
  │                                │  │ GET Patient/{id}              │  │  │
  │                                │  │ + If-None-Match: {stored_etag}│  │  │
  │                                │  │                               │  │  │
  │                                │  │ 304 Not Modified              │  │  │
  │                                │  │  └─ skip upsert               │  │  │
  │                                │  │ 200 OK + new ETag             │  │  │
  │                                │  │  └─ store full raw JSONB      │  │  │
  │                                │  │  └─ save new etag + version   │  │  │
  │                                │  └───────────────────────────────┘  │  │
  │                                │                                     │  │
  │                                │  Step 2 — Bundles (delta-sync)      │  │
  │                                │  ┌───────────────────────────────┐  │  │
  │                                │  │ GET Observation               │  │  │
  │                                │  │ ?_lastUpdated=gt{last_sync}   │  │  │
  │                                │  │                               │  │  │
  │                                │  │ Empty bundle                  │  │  │
  │                                │  │  └─ nothing to do             │  │  │
  │                                │  │ Non-empty bundle              │  │  │
  │                                │  │  └─ upsert changed rows only  │  │  │
  │                                │  │                               │  │  │
  │                                │  │ Same pattern for             │  │  │
  │                                │  │ MedicationRequest             │  │  │
  │                                │  └───────────────────────────────┘  │  │
  │                                │                                     │  │
  │                                │  Step 3 — Always serve from DB      │  │
  │                                │  (PostgreSQL is source of truth     │  │
  │                                │   for the frontend)                 │  │
  │                                └──────────────┬──────────────────────┘  │
  │                                               │                         │
  └───────────────────────────────────────────────┼─────────────────────────┘
                          ┌────────────────────────┤
                          │                        │
                          ▼                        ▼
  ┌────────────────────────────┐   ┌───────────────────────────────────────┐
  │     PostgreSQL :5432       │   │         Epic FHIR R4 API              │
  │                            │   │    fhir.epic.com/.../R4/              │
  │  patients                  │   │                                       │
  │   └─ raw JSONB (full res.) │   │  Conditional GET (single resource):   │
  │   └─ etag, fhir_version    │   │   If-None-Match → 304 or 200+ETag     │
  │                            │   │                                       │
  │  observations              │◄──│  Delta search (bundles):              │
  │   └─ raw JSONB             │   │   _lastUpdated=gt{timestamp}          │
  │   └─ fhir_last_updated     │   │   → empty bundle OR changed rows      │
  │                            │   │                                       │
  │  medication_requests       │   └───────────────────────────────────────┘
  │   └─ raw JSONB             │
  │   └─ fhir_last_updated     │
  │                            │
  │  sessions                  │
  │  oauth_states              │
  │  sync_log  ←─ per-patient, │
  │    per-resource-type stamp │
  └────────────────────────────┘

  Data flow legend:
  ──►  HTTP request / response
  ◄──► bidirectional DB read/write
```

---

## Change Detection Strategy

The app uses two complementary FHIR mechanisms to avoid redundant data transfer.

### Mechanism 1 — HTTP Conditional Requests (single resources)

Used for the **Patient** resource. FHIR mandates ETag support on all servers.

| Request | Header sent | Epic responds |
|---------|------------|---------------|
| First fetch | _(none)_ | `200 OK` + `ETag: "v5"` + full body |
| Subsequent fetch | `If-None-Match: "v5"` | `304 Not Modified` (no body) if unchanged |
| After update | `If-None-Match: "v5"` | `200 OK` + `ETag: "v6"` + new body |

The stored `etag` and `fhir_version` columns in the `patients` table drive this check.
On a `304`, the backend skips the upsert entirely and reads from the local DB.

### Mechanism 2 — `_lastUpdated` Delta Search (bundles)

Used for **Observations** and **MedicationRequests**. These are searched as FHIR Bundles, which don't support ETags individually.

```
GET Observation?patient={id}&category=vital-signs&_lastUpdated=gt2024-11-01T10:00:00Z
```

- Timestamp is read from `sync_log.last_checked_at` for `(patient_id, 'Observation:vital-signs')`
- Empty bundle → no changes → skip upsert, serve from DB
- Non-empty bundle → upsert only the returned records, update `sync_log`

### Token-Refresh Trigger

Every time the frontend acquires a **new token** (i.e., `POST /api/auth/callback`), the backend immediately runs `SyncService.syncAll()` in the background. This keeps the DB up to date without the user having to manually refresh data. The FHIR calls are cheap when nothing has changed (304 + empty bundles = minimal bytes).

```
Token acquired
     │
     ├─► syncPatient()      ← If-None-Match check (usually 304, ~0 bytes)
     ├─► syncObservations() ← _lastUpdated delta  (usually empty bundle)
     └─► syncMedications()  ← _lastUpdated delta  (usually empty bundle)
          │
          └─► update sync_log timestamps
```

---

## Step-by-Step Implementation

### Step 1 — Scaffold the backend

```
backend/
├── src/
│   ├── index.ts                    # Express entry, middleware, route registration
│   ├── routes/
│   │   ├── auth.ts                 # OAuth PKCE endpoints
│   │   └── fhir.ts                 # FHIR data endpoints
│   ├── services/
│   │   └── sync.ts                 # SyncService — change detection logic
│   ├── db/
│   │   ├── client.ts               # node-postgres pool
│   │   ├── migrate.ts              # runs migration files on startup
│   │   └── migrations/
│   │       └── 001_init.sql
│   └── types/
│       └── fhir.ts                 # TypeScript interfaces (Patient, Observation, etc.)
├── Dockerfile
├── package.json
└── tsconfig.json
```

**Runtime dependencies:** `express`, `cors`, `cookie-parser`, `axios`, `pkce-challenge`, `pg`, `dotenv`, `uuid`

**Dev dependencies:** `typescript`, `ts-node`, `nodemon`, `@types/express`, `@types/pg`, `@types/node`, `@types/cookie-parser`

---

### Step 2 — Database schema (`001_init.sql`)

Hybrid model: key relational columns for querying + `raw JSONB` for the complete FHIR resource. New columns (`etag`, `fhir_version`, `fhir_last_updated`) support change detection.

```sql
CREATE TABLE IF NOT EXISTS patients (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id           TEXT        UNIQUE NOT NULL,
  first_name        TEXT,
  last_name         TEXT,
  birth_date        DATE,
  gender            TEXT,
  mrn               TEXT,
  -- full FHIR Patient resource stored verbatim
  raw               JSONB,
  -- change-detection fields
  etag              TEXT,                        -- from ETag response header
  fhir_version      TEXT,                        -- meta.versionId
  fhir_last_updated TIMESTAMPTZ,                 -- meta.lastUpdated
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id           TEXT        UNIQUE NOT NULL,
  patient_epic_id   TEXT        NOT NULL REFERENCES patients(epic_id) ON DELETE CASCADE,
  category          TEXT        NOT NULL,        -- 'vital-signs' | 'laboratory'
  code_text         TEXT,
  effective_date    TIMESTAMPTZ,
  value_quantity    NUMERIC,
  value_unit        TEXT,
  value_string      TEXT,
  status            TEXT,
  interpretation    TEXT,
  raw               JSONB,
  fhir_last_updated TIMESTAMPTZ,                 -- meta.lastUpdated (used for delta queries)
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medication_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  epic_id           TEXT        UNIQUE NOT NULL,
  patient_epic_id   TEXT        NOT NULL REFERENCES patients(epic_id) ON DELETE CASCADE,
  medication_name   TEXT,
  status            TEXT,
  dosage_text       TEXT,
  authored_on       DATE,
  prescriber        TEXT,
  raw               JSONB,
  fhir_last_updated TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Ephemeral PKCE state: deleted after token exchange
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT        PRIMARY KEY,
  code_verifier TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Session: browser cookie → server-side access token
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_epic_id TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Sync audit log: tracks last successful sync per patient per resource type
-- Used as the lower bound for _lastUpdated delta queries
CREATE TABLE IF NOT EXISTS sync_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_epic_id TEXT        NOT NULL,
  resource_type   TEXT        NOT NULL,  -- 'Patient' | 'Observation:vital-signs' | 'Observation:laboratory' | 'MedicationRequest'
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  records_updated INT         DEFAULT 0,
  UNIQUE (patient_epic_id, resource_type)
);
```

---

### Step 3 — SyncService (`backend/src/services/sync.ts`)

Central service that encapsulates all change-detection logic. Called by the FHIR router and by the auth callback.

```typescript
class SyncService {
  // Called immediately after token exchange (background, non-blocking)
  async syncAll(patientId: string, accessToken: string): Promise<void>

  // Patient: uses If-None-Match conditional GET
  async syncPatient(patientId: string, accessToken: string): Promise<'hit' | 'miss'>
  //   'hit'  = 304 Not Modified, DB untouched
  //   'miss' = 200, full resource stored (raw JSONB + key fields + new etag)

  // Observations + Medications: use _lastUpdated delta query
  async syncObservations(patientId: string, category: 'vital-signs' | 'laboratory', accessToken: string): Promise<number>
  async syncMedications(patientId: string, accessToken: string): Promise<number>
  //   returns count of upserted records (0 = nothing changed)

  // Helpers
  private getStoredEtag(patientId: string): Promise<string | null>
  private getLastSyncTime(patientId: string, resourceType: string): Promise<Date | null>
  private upsertObservation(obs: Observation, patientId: string, category: string): Promise<void>
  private upsertMedication(med: MedicationRequest, patientId: string): Promise<void>
  private logSync(patientId: string, resourceType: string, count: number): Promise<void>
}
```

**Key implementation detail — upserts use `ON CONFLICT`:**
```sql
INSERT INTO observations (...) VALUES (...)
ON CONFLICT (epic_id) DO UPDATE SET
  raw               = EXCLUDED.raw,
  fhir_last_updated = EXCLUDED.fhir_last_updated,
  synced_at         = NOW()
WHERE observations.fhir_last_updated < EXCLUDED.fhir_last_updated;
-- The WHERE clause skips the write if the DB already has the latest version
```

---

### Step 4 — Auth routes (`backend/src/routes/auth.ts`)

| Endpoint | What it does |
|----------|-------------|
| `GET /api/auth/login` | Generates PKCE pair, stores `{state → code_verifier}` in `oauth_states`, returns `{ redirectUrl }` |
| `POST /api/auth/callback` | Receives `{ code, state }`, fetches verifier, exchanges with Epic for token, creates session, **triggers `syncAll()` in background**, sets `HttpOnly` session cookie |
| `POST /api/auth/logout` | Deletes session row, clears cookie |
| `GET /api/auth/me` | Returns `{ patientId, authenticated: true }` for valid session |

---

### Step 5 — FHIR routes (`backend/src/routes/fhir.ts`)

All routes require `requireSession` middleware (validates cookie → DB lookup).
All routes call `SyncService` first, then read from PostgreSQL.

| Endpoint | SyncService call | DB query |
|----------|-----------------|---------|
| `GET /api/fhir/patient` | `syncPatient()` | `SELECT * FROM patients WHERE epic_id = $1` |
| `GET /api/fhir/vitals` | `syncObservations(..., 'vital-signs')` | `SELECT * FROM observations WHERE category = 'vital-signs'` |
| `GET /api/fhir/labs` | `syncObservations(..., 'laboratory')` | `SELECT * FROM observations WHERE category = 'laboratory'` |
| `GET /api/fhir/medications` | `syncMedications()` | `SELECT * FROM medication_requests WHERE patient_epic_id = $1` |

Response always comes from the DB, never forwarded raw from Epic.

---

### Step 6 — Frontend changes

**Files to modify:**

| File | Change |
|------|--------|
| `src/config.ts` | Remove all Epic URLs and client ID; add `export const API_BASE = '/api'` |
| `src/App.svelte` | Replace PKCE logic with `fetch('/api/auth/login')` redirect + `fetch('/api/auth/callback', { method: 'POST' })` on return; check session via `GET /api/auth/me` on mount |
| `src/lib/fhir.ts` | Replace all `axios.get(FHIR_BASE_URL + ...)` calls with `fetch('/api/fhir/...')` using `credentials: 'include'`; remove Bearer token header |
| `src/lib/store.ts` | Remove `token` writable store |
| `vite.config.ts` | Add dev proxy: `server: { proxy: { '/api': 'http://localhost:3000' } }` |

---

### Step 7 — Docker updates

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

**`nginx.conf`** — add `/api/` proxy block before the SPA fallback:
```nginx
location /api/ {
    proxy_pass         http://backend:3000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**`docker-compose.yml`** — three services + named volume:
```yaml
services:
  frontend:
    build: .
    ports: ["5173:80"]
    depends_on: [backend]

  backend:
    build: ./backend
    environment:
      DATABASE_URL:       postgres://postgres:postgres@db:5432/epic_app
      SESSION_SECRET:     changeme_in_production
      EPIC_CLIENT_ID:     4268a20b-9eb5-4baa-a735-b257f87d6100
      EPIC_FHIR_BASE_URL: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/
      EPIC_AUTH_URL:      https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize
      EPIC_TOKEN_URL:     https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
      REDIRECT_URI:       http://localhost:5173/
    depends_on: [db]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB:       epic_app
      POSTGRES_USER:     postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

**`.env.example`** (new) — documents all required env vars with placeholder values.

---

## Critical Files Summary

| Path | Status | Change |
|------|--------|--------|
| `src/config.ts` | modify | Remove Epic URLs; add `API_BASE` |
| `src/App.svelte` | modify | Replace OAuth logic with backend calls |
| `src/lib/fhir.ts` | modify | Point all FHIR calls to `/api/fhir/*` |
| `src/lib/store.ts` | modify | Remove `token` store |
| `vite.config.ts` | modify | Add `/api` dev proxy |
| `nginx.conf` | modify | Add `/api/` upstream proxy block |
| `docker-compose.yml` | modify | Add `backend` + `db` services |
| `backend/` | new | Entire backend project (all files) |
| `.env.example` | new | Env var documentation |

---

## Verification Checklist

1. `docker compose up --build` — all 3 containers healthy; backend logs `Migrations complete` and `Listening on :3000`
2. `http://localhost:5173/` → Login button visible (no token in localStorage)
3. Click Login → redirect to Epic OAuth (URL contains `code_challenge`, no `client_secret`)
4. Complete Epic auth → redirected back, Dashboard renders patient data
5. Check DB:
   ```bash
   docker compose exec db psql -U postgres epic_app
   SELECT epic_id, first_name, last_name, etag FROM patients;
   SELECT count(*), category FROM observations GROUP BY category;
   SELECT count(*) FROM medication_requests;
   SELECT * FROM sync_log;
   ```
6. Log out and log back in → `sync_log.last_checked_at` updates; second sync is fast (mostly 304s + empty bundles)
7. Inspect network tab in browser → **no requests to fhir.epic.com** (all go to `/api/*`)
