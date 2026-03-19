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

| Task Type | What happens |
|---|---|
| MCQ Quiz | Detects questions, picks correct option, submits |
| Coding Contest | Reads problem + constraints, generates solution, submits |
| Assignment | Reads prompt, writes structured answer, submits |
| In-class Quiz | Extension catches it the moment it launches — solves in seconds |

Students bring their own AI key (Claude / GPT-4o / Gemini) — zero cost to run.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Student Browser                       │
│                                                         │
│   ┌─────────────────────┐   ┌──────────────────────┐   │
│   │  Newton School       │   │  Chrome Extension    │   │
│   │  Portal              │◄──│                      │   │
│   │  my.newtonschool.co  │   │  • Reads DOM live    │   │
│   └─────────────────────┘   │  • Detects events    │   │
│                              │  • Fills + submits   │   │
│                              │  • Overlay UI        │   │
│                              └──────────┬───────────┘   │
└─────────────────────────────────────────│───────────────┘
                                          │ solve request
                              ┌───────────▼───────────┐
                              │    Backend Server      │
                              │    Python + FastAPI    │
                              │                        │
                              │  • 60s background poll │
                              │  • Multi-user manager  │
                              │  • LLM solver engine   │
                              │  • Telegram notifier   │
                              └───────┬───────┬────────┘
                                      │       │
                           ┌──────────▼─┐  ┌──▼──────────┐
                           │  Supabase  │  │  Claude API  │
                           │  Database  │  │  GPT-4o      │
                           │            │  │  Gemini      │
                           └────────────┘  └─────────────┘
```

---

## Project Structure

```
newton-ai-agent/
│
├── 📁 extension/                  # Chrome Extension (MV3)
│   ├── src/
│   │   ├── background.js          # Service worker — API calls, alarms
│   │   ├── content.js             # Runs on portal — DOM reading
│   │   ├── popup.js               # Popup logic
│   │   └── options.js             # Settings page logic
│   ├── popup/
│   │   ├── popup.html             # Status, toggle, last activity
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html           # API token, schedule config
│   │   └── options.css
│   ├── icons/                     # 16x16, 48x48, 128x128
│   └── manifest.json              # MV3 manifest
│
├── 📁 backend/                    # Python + FastAPI Server
│   ├── app/
│   │   ├── main.py                # FastAPI app entry point
│   │   ├── config.py              # Environment variables
│   │   ├── routes/
│   │   │   ├── auth.py            # Register, login, token verify
│   │   │   ├── solve.py           # POST /solve — LLM solver endpoint
│   │   │   └── tasks.py           # Task history endpoints
│   │   ├── services/
│   │   │   ├── browser.py         # Playwright login + scraping
│   │   │   ├── solver.py          # Claude / GPT-4o / Gemini solver
│   │   │   ├── scheduler.py       # APScheduler background polling
│   │   │   └── notifier.py        # Telegram bot notifications
│   │   ├── db/
│   │   │   ├── supabase.py        # Supabase client
│   │   │   └── schema.sql         # Full database schema
│   │   └── models/
│   │       └── schemas.py         # Pydantic models
│   ├── .env                       # Your real keys (never commit)
│   └── requirements.txt
│
├── 📁 dashboard/                  # React + Vite + TypeScript
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
├── .env.example                   # Template — safe to commit
├── .gitignore
└── README.md
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Browser automation | Playwright (Python async) | Login, DOM scraping, form submission |
| Backend | FastAPI + Python 3.13 | API server, background scheduler |
| AI Solver | Claude / GPT-4o / Gemini | Solving tasks (user's own key) |
| Database | Supabase (PostgreSQL) | Users, tasks, runs, sessions |
| Realtime | Supabase Realtime | Live task updates to dashboard |
| Scheduler | APScheduler | 60s background polling per student |
| Frontend | React + Vite + TypeScript | Student dashboard |
| Styling | Tailwind CSS | UI styling |
| Notifications | Telegram Bot API | Instant alerts |
| Security | AES-256 encryption | Credential storage |
| Logging | Loguru | Structured backend logs |

---

## Database Schema

```
users         → student accounts + encrypted portal creds + LLM key
sessions      → playwright browser cookies (auto-refreshed)
tasks         → every detected task: type, status, score, timestamps
runs          → every LLM call: prompt, response, success/fail, errors
user_stats    → computed view: success rate, totals by task type
```

---

## Features

### Core
- **Multi-user** — one backend serves all students simultaneously
- **Any LLM** — Claude, GPT-4o, or Gemini — student picks and pays for their own
- **Provider-agnostic solver** — same interface, different SDK under the hood
- **AES-encrypted credentials** — portal passwords and API keys never stored plain

### Detection
- **Background poller** — scans all accounts every 60 seconds
- **In-class watcher** — switches to 5s polling during class hours
- **MutationObserver** — extension catches live quiz launches in under 1 second
- **Deduplication** — never re-attempts a completed task
- **Deadline sorter** — processes soonest-expiring tasks first

### Solving
- **MCQ solver** — returns only the correct option letter
- **Coding solver** — reads problem + constraints + sample I/O, generates optimal solution
- **Text assignment solver** — respects word limits and format
- **Response validator** — checks answer before submitting
- **Retry with error context** — up to 3 retries, error message injected into prompt
- **Multi-language** — detects required language (Python / C++ / Java) automatically

### Dashboard
- **Live task feed** — Supabase Realtime push updates
- **Run log viewer** — see exactly what the LLM answered per task
- **Per-course toggles** — disable bot for specific subjects
- **Class schedule config** — set timetable so watcher activates during class

---

## Build Roadmap

```
Phase 0  ████████████████████  ✅  Project setup + Supabase schema
Phase 1  ░░░░░░░░░░░░░░░░░░░░  ⬜  Chrome extension skeleton
Phase 2  ░░░░░░░░░░░░░░░░░░░░  ⬜  Portal detection (content script)
Phase 3  ░░░░░░░░░░░░░░░░░░░░  ⬜  Backend server + scheduler
Phase 4  ░░░░░░░░░░░░░░░░░░░░  ⬜  LLM solver engine
Phase 5  ░░░░░░░░░░░░░░░░░░░░  ⬜  Submission layer
Phase 6  ░░░░░░░░░░░░░░░░░░░░  ⬜  React dashboard
Phase 7  ░░░░░░░░░░░░░░░░░░░░  ⬜  Notifications + deployment
```

- [x] **Phase 0** — Monorepo setup, Supabase schema, Python venv, React + Vite init
- [ ] **Phase 1** — Chrome extension: manifest.json, background.js, content.js, popup UI, options page
- [ ] **Phase 2** — Portal DOM recon, MutationObserver, task classifier, question extractor, overlay UI
- [ ] **Phase 3** — FastAPI routes, Playwright session manager, APScheduler background polling
- [ ] **Phase 4** — Provider-agnostic LLM solver, validators, retry logic, `/solve` endpoint
- [ ] **Phase 5** — Form fillers per task type, submit handler, error recovery
- [ ] **Phase 6** — React pages, Supabase Realtime feed, stats cards, run log viewer
- [ ] **Phase 7** — Telegram bot, daily digest, Railway deploy, Vercel deploy

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- Supabase account
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
playwright install chromium
```

Fill in `backend/.env`:
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-service-role-key
AES_SECRET_KEY=your-32-byte-hex-key
BACKEND_URL=http://localhost:8000
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

### 3. Dashboard
```bash
cd dashboard
npm install
npm run dev
# http://localhost:5173
```

Fill in `dashboard/.env`:
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
VITE_BACKEND_URL=http://localhost:8000
```

### 4. Chrome Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Pin the extension and enter your API token from the dashboard

---

## Environment Variables

### `backend/.env`
| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_KEY` | Service role (secret) key | ✅ |
| `AES_SECRET_KEY` | 32-byte hex for encrypting credentials | ✅ |
| `TELEGRAM_BOT_TOKEN` | For Telegram notifications | Optional |
| `BACKEND_URL` | Server URL | ✅ |

### `dashboard/.env`
| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Anon/publishable key | ✅ |
| `VITE_BACKEND_URL` | Backend server URL | ✅ |

---

## Security

- Portal passwords and LLM API keys are **AES-256 encrypted** before storing
- The `service_role` key is backend-only — never sent to the frontend
- **Row Level Security (RLS)** — students only see their own data
- `.env` files are gitignored and never committed
- API token auth on every extension → backend request

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m "add: your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## Disclaimer

This project was built as a challenge assignment at Newton School of Technology. Use responsibly and in accordance with your institution's academic policies.

---

