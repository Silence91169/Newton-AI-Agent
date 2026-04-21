"""Pydantic request / response models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


# ── Newton user identity (sent from extension) ────────────────────────────────

class NewtonUser(BaseModel):
    id:       Optional[str] = None
    email:    Optional[str] = None
    username: Optional[str] = None


# ── Solve ─────────────────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    groq_api_key: str
    newton_user:  Optional[NewtonUser] = None
    task_type:    str                          # mcq | coding | assignment
    question:     str
    options:      Optional[list[str]] = None   # MCQ option texts
    language:     Optional[str] = None         # coding language id
    starter_code: Optional[str] = None         # coding starter code to fill in
    constraints:  Optional[str] = None         # extra constraints / problem details
    sample_io:    Optional[str] = None         # sample input/output
    error_context: Optional[str] = None        # stderr from previous failed attempt
    url:          Optional[str] = None         # portal URL of the task


class SolveResponse(BaseModel):
    answer: str
