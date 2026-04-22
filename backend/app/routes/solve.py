"""
Newton AI Agent — Solve endpoint.

POST /solve
  Body: { llm_api_key, llm_provider, newton_user, task_type, question, ... }

Flow:
  1. Validate llm_api_key and llm_provider
  2. Derive a stable newton_user_id from newton_user (or fallback to key hash)
  3. Upsert user in Supabase (auto-register on first request)
  4. Run the solver
  5. Log to usage_logs
  6. Return the answer
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from loguru import logger

from app.config import encrypt
from app.db.supabase import supabase
from app.models.schemas import SolveRequest, SolveResponse
from app.services import solver as solver_svc

router = APIRouter(tags=["solve"])

UTC = timezone.utc

VALID_PROVIDERS = {"groq", "openai", "anthropic", "gemini", "nvidia"}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _derive_user_id(req: SolveRequest) -> str:
    """
    Return a stable string identifier for the Newton user.
    Priority: JWT id → email → sha256 prefix of the API key (last resort).
    """
    if req.newton_user:
        if req.newton_user.id:
            return req.newton_user.id
        if req.newton_user.email:
            return req.newton_user.email
    return "key:" + hashlib.sha256(req.llm_api_key[:16].encode()).hexdigest()[:16]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/solve", response_model=SolveResponse)
async def solve_endpoint(req: SolveRequest):
    # ── 1. Validate ────────────────────────────────────────────────────────────
    if not req.llm_api_key:
        raise HTTPException(status_code=400, detail="llm_api_key is required")

    provider = req.llm_provider.lower()
    if provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=422,
            detail=f"llm_provider must be one of: {', '.join(sorted(VALID_PROVIDERS))}",
        )

    if req.task_type not in ("mcq", "coding", "assignment"):
        raise HTTPException(
            status_code=422,
            detail="task_type must be one of: mcq, coding, assignment",
        )
    if req.task_type == "mcq" and not req.options:
        raise HTTPException(status_code=422, detail="options is required for MCQ tasks")

    # ── 2. Derive user identity ────────────────────────────────────────────────
    newton_user_id = _derive_user_id(req)
    email    = req.newton_user.email    if req.newton_user else None
    username = req.newton_user.username if req.newton_user else None

    # ── 3. Upsert user in Supabase ─────────────────────────────────────────────
    try:
        supabase.table("users").upsert(
            {
                "newton_user_id": newton_user_id,
                "email":          email,
                "username":       username,
                "api_key_enc":    encrypt(req.llm_api_key),
                "llm_provider":   provider,
                "last_seen":      _now_iso(),
            },
            on_conflict="newton_user_id",
        ).execute()
    except Exception as exc:
        logger.warning(f"[solve] User upsert failed (non-fatal): {exc}")

    logger.info(
        f"[solve] user={newton_user_id} provider={provider} "
        f"type={req.task_type} url={req.url}"
    )

    # ── 4. Run solver ──────────────────────────────────────────────────────────
    solve_result = None
    run_error: str | None = None

    try:
        solve_result = await solver_svc.solve(
            provider=provider,
            api_key=req.llm_api_key,
            task_type=req.task_type,
            question=req.question,
            options=req.options,
            language=req.language,
            starter_code=req.starter_code,
            constraints=req.constraints,
            sample_io=req.sample_io,
            error_context=req.error_context,
        )
    except Exception as exc:
        run_error = str(exc)
        logger.error(f"[solve] Solver failed for {newton_user_id}: {exc}")

    # ── 5. Log to usage_logs ───────────────────────────────────────────────────
    try:
        supabase.table("usage_logs").insert({
            "newton_user_id": newton_user_id,
            "task_type":      req.task_type,
            "page_url":       req.url,
            "success":        solve_result is not None,
        }).execute()
    except Exception as exc:
        logger.warning(f"[solve] usage_logs insert failed (non-fatal): {exc}")

    # ── 6. Return ──────────────────────────────────────────────────────────────
    if not solve_result:
        raise HTTPException(
            status_code=502,
            detail=f"Solver failed: {run_error or 'unknown error'}",
        )

    return SolveResponse(answer=solve_result.answer)
