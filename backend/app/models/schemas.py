"""Pydantic request / response models."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: Optional[str] = None
    portal_username: str
    portal_password: str
    llm_provider: str = "anthropic"   # anthropic | openai | gemini | groq
    llm_api_key: str
    telegram_chat_id: Optional[str] = None


class LoginRequest(BaseModel):
    portal_username: str
    portal_password: str


class UserUpdate(BaseModel):
    llm_provider: Optional[str] = None   # anthropic | openai | gemini | groq
    llm_api_key:  Optional[str] = None


class UserOut(BaseModel):
    id: str
    name: str
    portal_username: str
    llm_provider: str
    enabled: bool
    api_token: str
    created_at: datetime


# ── Solve ─────────────────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    api_token: str
    task_type: str                          # mcq | coding | assignment
    question: str
    options: Optional[list[str]] = None     # MCQ option texts
    language: Optional[str] = None          # coding language id
    starter_code: Optional[str] = None      # coding starter code to fill in
    constraints: Optional[str] = None       # extra constraints / problem details
    sample_io: Optional[str] = None         # sample input/output
    error_context: Optional[str] = None     # stderr from previous failed attempt
    url: Optional[str] = None               # portal URL of the task
    auth_headers: Optional[dict[str, Any]] = None  # Newton portal auth (ignored server-side)


class SolveResponse(BaseModel):
    answer: str
    task_id: Optional[str] = None


# ── Tasks ─────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    task_type: str
    title: str
    url: Optional[str] = None
    course_hash: Optional[str] = None
    assessment_hash: Optional[str] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    score: Optional[str] = None
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None


class RunOut(BaseModel):
    id: str
    task_id: str
    attempt: int
    prompt: str
    response: Optional[str] = None
    success: Optional[bool] = None
    error_message: Optional[str] = None
    tokens_used: Optional[int] = None
    duration_ms: Optional[int] = None
    created_at: datetime


class TaskOut(BaseModel):
    id: str
    user_id: str
    task_type: str
    title: str
    url: Optional[str] = None
    status: str
    score: Optional[str] = None
    error_message: Optional[str] = None
    detected_at: datetime
    completed_at: Optional[datetime] = None


class TaskDetailOut(TaskOut):
    runs: list[RunOut] = Field(default_factory=list)
