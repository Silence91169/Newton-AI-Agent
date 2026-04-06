# Newton AI Agent

> AI-powered assistant that automatically solves assignments, quizzes, and coding contests on Newton School of Technology's portal.

![Python](https://img.shields.io/badge/Python-3.13-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=flat-square&logo=supabase)
![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow?style=flat-square&logo=googlechrome)

---

## What it does

Newton AI Agent runs silently in the background and handles everything on your Newton School portal automatically:

| Task Type | Status | What happens |
|---|---|---|
| MCQ Quiz | ✅ Working | Detects questions, picks correct option, auto-navigates, submits |
| Live Quiz | ✅ Working | Detects `/lecture/*/live` polls, solves each question, submits |
| Coding Contest | ✅ Working | Reads problem, generates solution via LLM, fills INPUT, runs, submits |
| Assignment | Coming soon | Reads prompt, writes structured answer, submits |
| Jupyter Notebook | Coming soon | Solves notebook cells automatically |
| Excel / Power BI | Coming soon | Completes data tasks and submissions |

Students bring their own AI key (Groq free / Claude / GPT-4o / Gemini) — zero cost to run.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Student Browser                          │
│                                                                  │
│   ┌─────────────────────┐   ┌──────────────────────────────┐   │
│   │  Newton School       │   │     Chrome Extension (MV3)   │   │
│   │  Portal              │◄──│                              │   │
│   │  my.newtonschool.co  │   │  ┌────────────────────────┐  │   │
│   └─────────────────────┘   │  │ content.js             │  │   │
│                              │  │ (isolated world)        │  │   │
│                              │  │ • DOM reading           │  │   │
│                              │  │ • Solver orchestration  │  │   │
│                              │  │ • Overlay UI            │  │   │
│                              │  └──────────┬─────────────┘  │   │
│                              │    CustomEvents (both ways)   │   │
│                              │  ┌──────────▼─────────────┐  │   │
│                              │  │ page_bridge.js          │  │   │
│                              │  │ (MAIN world)            │  │   │
│                              │  │ • Monaco editor access  │  │   │
│                              │  │ • Read/write code       │  │   │
│                              │  │ • Read output/errors    │  │   │
│                              │  └────────────────────────┘  │   │
│                              │  ┌────────────────────────┐  │   │
│                              │  │ auth_bridge.js (MAIN)   │  │   │
│                              │  │ • Captures auth headers │  │   │
│                              │  └────────────────────────┘  │   │
│                              └──────────────┬───────────────┘   │
└─────────────────────────────────────────────│───────────────────┘
                                              │ solve request
                                  ┌───────────▼───────────┐
                                  │    Backend Server      │
                                  │    Python + FastAPI    │
                                  │                        │
                                  │  • Auth + token mgmt  │
                                  │  • LLM solver engine  │
                                  │  • Task history        │
                                  └───────┬───────┬────────┘
                                          │       │
                               ┌──────────▼─┐  ┌──▼────────────────┐
                               │  Supabase  │  │  Groq (free)       │
                               │  Database  │  │  Claude / GPT-4o   │
                               │  + RLS     │  │  Gemini            │
                               └────────────┘  └───────────────────┘
```

### Monaco Bridge Architecture

Chrome extensions run content scripts in an **isolated world** — they cannot access `window.monaco` or any page JS. All Monaco operations are proxied through `page_bridge.js` (MAIN world) via CustomEvents:

```
content.js (isolated)          page_bridge.js (MAIN world)
─────────────────────          ───────────────────────────
naa_find_editor       ──────►  finds best editor → naa_editor_found
naa_get_code          ──────►  reads editor value → naa_code_result
naa_set_code          ──────►  executeEdits() → naa_set_code_result
naa_get_output        ──────►  reads output/error editors → naa_output_result
```

---

## Project Structure

```
newton-ai-agent/
│
├── 📁 extension/                  # Chrome Extension (MV3)
│   ├── src/
│   │   ├── background.js          # Service worker — API calls to backend
│   │   ├── content.js             # Isolated world — DOM reading + solver logic
│   │   ├── page_bridge.js         # MAIN world — ALL Monaco editor operations
│   │   ├── auth_bridge.js         # MAIN world — fetch/XHR auth header capture
│   │   ├── popup.js               # Popup logic
│   │   └── options.js             # Settings page logic
│   ├── popup/
│   │   ├── popup.html             # Status, toggle, last activity
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html           # API token entry
│   │   └── options.css
│   ├── icons/                     # 16x16, 48x48, 128x128
│   └── manifest.json              # MV3 manifest
│
├── 📁 backend/                    # Python + FastAPI Server
│   ├── app/
│   │   ├── main.py                # FastAPI app — CORS allow_origins=["*"]
│   │   ├── config.py              # AES encryption + env variables
│   │   ├── routes/
│   │   │   ├── auth.py            # /auth/register, login, verify, update
│   │   │   ├── solve.py           # POST /solve — LLM solver endpoint
│   │   │   └── tasks.py           # GET/POST/PATCH/DELETE /tasks
│   │   ├── services/
│   │   │   └── solver.py          # Provider-agnostic LLM solver
│   │   ├── db/
│   │   │   ├── supabase.py        # Supabase client
│   │   │   └── schema.sql         # Full database schema
│   │   └── models/
│   │       └── schemas.py         # Pydantic models
│   ├── .env                       # Your real keys (never commit)
│   ├── .env.example               # Template — safe to commit
│   └── requirements.txt
│
├── 📁 dashboard/                  # React + Vite + TypeScript (scaffolded)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Register.tsx       # Student registration
│   │   │   ├── Login.tsx          # Dashboard login
│   │   │   ├── Home.tsx           # Stats + live task feed
│   │   │   ├── Logs.tsx           # Run log viewer
│   │   │   └── Settings.tsx       # Schedule + toggles
│   │   ├── components/
│   │   │   ├── TaskFeed.tsx       # Realtime task list
│   │   │   ├── StatsCards.tsx     # Progress stats
│   │   │   └── RunLog.tsx         # Expandable LLM logs
│   │   └── lib/
│   │       ├── supabase.ts        # Supabase client
│   │       └── api.ts             # Backend API calls
│   └── .env
│
├── .gitignore
└── README.md
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Extension | Chrome MV3, vanilla JS | DOM detection, form filling, submission |
| Backend | FastAPI + Python 3.13, Uvicorn | API server, LLM routing, task history |
| AI Solver | Groq / Claude / GPT-4o / Gemini | Solving tasks (user's own key) |
| Database | Supabase (PostgreSQL) | Users, tasks, runs, sessions with RLS |
| Security | AES-256-GCM encryption | Credential and API key storage |
| Logging | Loguru | Structured backend logs |
| Frontend | React + Vite + TypeScript + Tailwind | Student dashboard (coming soon) |

---

## Database Schema

```
users         → student accounts + encrypted portal creds + LLM key
sessions      → login session storage
tasks         → every detected task: type, status, timestamps
runs          → every LLM call: prompt, response, tokens, success/fail
user_stats    → computed view: success rate, totals by task type
```

---

## LLM Providers

| Provider | Model | Cost | Recommended |
|---|---|---|---|
| Groq | llama-3.3-70b-versatile | Free tier available | ✅ Start here |
| Anthropic | claude-sonnet-4-6 | Pay-per-token | Best accuracy |
| OpenAI | gpt-4o | Pay-per-token | Reliable |
| Google | gemini-2.0-flash | Pay-per-token | Fast |

---

## Features

### Working now

- **MCQ solver** — chain-of-thought reasoning, picks correct option digit, auto-navigates questions, submits
- **Live quiz solver** — detects `/lecture/*/live` URLs, solves poll/quiz modals question by question
  - Selectors: `sc-f9e3e3ee-4` (question text), `sc-5a2039c7-15` (option text), `sc-67e9c95b-3` (clickable wrapper)
  - Falls back to text-click if wrapper not found; waits for question change before advancing
- **Coding solver** — fully working end-to-end with Monaco bridge architecture
  - `page_bridge.js` handles ALL Monaco operations (MAIN world) — read code, write code, read output
  - `content.js` fires CustomEvents and listens for results (isolated world)
  - Extracts problem description from `sc-3ef8580b-6` / `sc-3ef8580b-11` selectors
  - Detects language from dropdown (`sc-6e1082ef-2` / `cOVIPX` selectors)
  - Auto-fills the INPUT tab with example input parsed from the problem statement
  - Retries up to 3 times — each retry includes test results + stderr + stdout as error context
  - TypeScript-specific LLM rules: no `require()`, no imports, preserve all interfaces
- **CORS fix** — `allow_origins=["*"]` with `allow_credentials=False` so `chrome-extension://` origins can call the backend
- **MV3 extension** — manifest, service worker, content scripts, popup, options page, overlay
- **MAIN world bridges** — `page_bridge.js` for Monaco, `auth_bridge.js` for auth header capture via CustomEvents (no CSP violations)
- **FastAPI backend** — register, login, verify, update, solve, task history endpoints
- **Provider-agnostic solver** — same interface across Groq / Claude / GPT-4o / Gemini
- **AES-256-GCM encryption** — portal passwords and LLM API keys encrypted at rest
- **Supabase with RLS** — users only see their own tasks and run logs

### Known issues / in progress

- Coding solver accuracy depends on LLM quality and problem complexity
- Planning: solutions database for fallback (verified community solutions)
- Decryption warning for unencrypted API keys is non-fatal (has fallback path)
- Supabase `url` column removed from task insert — schema must match current `schema.sql`

---

## Build Roadmap

```
Phase 0  ████████████████████  ✅  Project setup + Supabase schema
Phase 1  ████████████████████  ✅  Chrome extension (MV3) — full build
Phase 2  ████████████████████  ✅  Portal solvers — MCQ, Live Quiz, Coding done
Phase 3  ░░░░░░░░░░░░░░░░░░░░  ⬜  React dashboard
Phase 4  ░░░░░░░░░░░░░░░░░░░░  ⬜  Telegram notifications
Phase 5  ░░░░░░░░░░░░░░░░░░░░  ⬜  Railway / Vercel deployment
```

- [x] **Phase 0** — Monorepo setup, Supabase schema (users, sessions, tasks, runs, user_stats), Python venv, React + Vite scaffold
- [x] **Phase 1** — Chrome extension: MV3 manifest, background.js service worker, content.js, page_bridge.js (MAIN world Monaco bridge), auth_bridge.js (MAIN world auth capture), popup UI, options page, overlay
- [x] **Phase 1** — FastAPI backend: `/auth/register`, `/auth/login`, `/auth/verify`, `/auth/update`, `POST /solve`, `/tasks` CRUD; provider-agnostic solver (Groq / Claude / GPT-4o / Gemini); AES-256 key encryption
- [x] **Phase 2** — MCQ solver fully working with auto-navigation and submission
- [x] **Phase 2** — Live quiz solver (`/lecture/*/live`) — detects polls, solves, submits
- [x] **Phase 2** — Coding solver — Monaco bridge, problem extraction, INPUT fill, 3-attempt retry with error context, TypeScript-specific LLM rules, CORS fix for extension origins
- [ ] **Phase 2** — Jupyter Notebook solver, Excel solver, Power BI solver
- [ ] **Phase 3** — React dashboard: live task feed, run log viewer, stats cards, per-course toggles
- [ ] **Phase 4** — Telegram bot notifications, daily digest
- [ ] **Phase 5** — Railway deploy (backend), Vercel deploy (dashboard)

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Supabase account (free tier works)
- Chrome browser

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/newton-ai-agent.git
cd newton-ai-agent
```

### 2. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
```

Fill in `backend/.env` (copy from `.env.example`):
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-service-role-key
AES_SECRET_KEY=your-64-char-hex-key
BACKEND_URL=http://localhost:8000
CORS_ORIGINS=*
```

Generate AES key:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Run the schema in Supabase SQL editor — copy `backend/app/db/schema.sql` and paste it in.

Start the server:
```bash
uvicorn app.main:app --reload
# http://localhost:8000
```

### 3. Register a user
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "portal_username": "your@email.com",
    "portal_password": "your-portal-password",
    "llm_provider": "groq",
    "llm_api_key": "gsk_..."
  }'
```

Save the `api_token` from the response — you'll need it for the extension.

### 4. Chrome Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Click the extension icon → open **Settings**
6. Paste your `api_token` and save

The extension will start detecting and solving tasks automatically on `my.newtonschool.co`.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account, get API token |
| `POST` | `/auth/login` | Login with portal credentials |
| `GET` | `/auth/verify` | Verify Bearer token |
| `PATCH` | `/auth/update` | Update LLM provider or API key |

### Solve
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/solve` | Send question, get answer |

Payload for MCQ:
```json
{ "task_type": "mcq", "question": "...", "options": ["A", "B", "C", "D"] }
```

Payload for coding:
```json
{
  "task_type": "coding",
  "question": "...",
  "language": "typescript",
  "starter_code": "...",
  "error_context": "optional — previous attempt stderr/results"
}
```

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tasks` | List task history |
| `GET` | `/tasks/stats` | Aggregated stats |
| `GET` | `/tasks/{id}` | Single task + runs |
| `POST` | `/tasks` | Create task manually |
| `PATCH` | `/tasks/{id}` | Update task status |
| `DELETE` | `/tasks/{id}` | Delete task |

---

## Environment Variables

### `backend/.env`
| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_KEY` | Service role (secret) key | ✅ |
| `AES_SECRET_KEY` | 64-char hex for encrypting credentials | ✅ |
| `BACKEND_URL` | Server URL | ✅ |
| `CORS_ORIGINS` | Allowed origins (`*` covers chrome-extension://) | Optional |
| `TELEGRAM_BOT_TOKEN` | For Telegram notifications | Optional |

### `dashboard/.env`
| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Anon/publishable key | ✅ |
| `VITE_BACKEND_URL` | Backend server URL | ✅ |

---

## Security

- Portal passwords and LLM API keys are **AES-256-GCM encrypted** before storing
- The `service_role` key is backend-only — never sent to the frontend
- **Row Level Security (RLS)** — students only see their own data
- **Bearer token auth** on every extension → backend request
- **No inline scripts** — CSP-safe MV3 extension using MAIN world content scripts instead of `<script>` injection
- **CORS** — `allow_origins=["*"]` with `allow_credentials=False` (required to support `chrome-extension://` origins; credentials mode is incompatible with wildcard origins per the CORS spec)
- `.env` files are gitignored and never committed

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m "add: your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## Disclaimer

This project was a challenge assignment  Use responsibly.

---
