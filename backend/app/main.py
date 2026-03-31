"""
Newton AI Agent — FastAPI application entry point.

Start with:
    uvicorn app.main:app --reload        # development
    uvicorn app.main:app --host 0.0.0.0  # production
"""
from __future__ import annotations

import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

# ── Logging setup (before any other imports that might log) ───────────────────
os.makedirs("logs", exist_ok=True)

logger.remove()
logger.add(
    sys.stdout,
    colorize=True,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
)
logger.add(
    "logs/app.log",
    rotation="1 day",
    retention="7 days",
    enqueue=True,
)

# ── App ───────────────────────────────────────────────────────────────────────
from app.config import CORS_ORIGINS, ENVIRONMENT  # noqa: E402 — after logger setup

app = FastAPI(
    title="Newton AI Agent",
    version="1.0.0",
    description="Backend API for the Newton School AI Agent Chrome extension",
    docs_url="/docs" if ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if ENVIRONMENT != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # covers chrome-extension://* and all web origins
    allow_credentials=False,   # must be False when allow_origins="*"
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routes.auth  import router as auth_router   # noqa: E402
from app.routes.solve import router as solve_router  # noqa: E402
from app.routes.tasks import router as tasks_router  # noqa: E402

app.include_router(auth_router)
app.include_router(solve_router)
app.include_router(tasks_router)

# ── Root routes ───────────────────────────────────────────────────────────────

@app.get("/", tags=["meta"])
def root():
    return {"status": "Newton AI Agent running", "version": "1.0.0"}


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


# ── Startup log ───────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    logger.info(f"Newton AI Agent started — environment={ENVIRONMENT}")