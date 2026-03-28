"""
Newton AI Agent — Solve endpoint.

POST /solve
  Body: SolveRequest (api_token in body, not header)
  Returns: SolveResponse { answer, task_id }

Flow:
  1. Look up user by api_token from request body
  2. Decrypt their LLM API key
  3. Create a task record (status=solving)
  4. Run the LLM solver
  5. Store the run record
  6. Update task status (solved / failed)
  7. Return the answer
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from loguru import logger

from app.config import decrypt
from app.db.supabase import supabase
from app.models.schemas import SolveRequest, SolveResponse
from app.services import solver as solver_svc

router = APIRouter(tags=["solve"])

UTC = timezone.utc


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _make_title(req: SolveRequest) -> str:
    """Short human-readable task title derived from the question."""
    prefix = {
        "mcq":        "MCQ",
        "coding":     "Coding",
        "assignment": "Assignment",
    }.get(req.task_type, req.task_type.upper())
    snippet = (req.question or "")[:60].replace("\n", " ").strip()
    return f"[{prefix}] {snippet}…" if len(req.question or "") > 60 else f"[{prefix}] {snippet}"


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/solve", response_model=SolveResponse)
async def solve_endpoint(req: SolveRequest):
    # ── 1. Authenticate via api_token in body ──────────────────────────────
    if not req.api_token:
        raise HTTPException(status_code=401, detail="api_token is required")

    try:
        user_result = (
            supabase.table("users")
            .select("id, name, llm_provider, llm_api_key_enc, is_active")
            .eq("api_token", req.api_token)
            .single()
            .execute()
        )
    except Exception as exc:
        logger.error(f"[solve] DB lookup error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not user_result.data:
        raise HTTPException(status_code=401, detail="Invalid API token")

    user = user_result.data
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Agent is disabled for this account")

    # ── 2. Decrypt LLM API key ─────────────────────────────────────────────
    try:
        llm_api_key = decrypt(user["llm_api_key_enc"])
    except Exception:
        # Key may be stored unencrypted — use the raw value as-is
        logger.warning(f"[solve] Decryption failed for user {user['id']}, using raw key value")
        llm_api_key = user["llm_api_key_enc"]

    # ── 3. Validate task_type ─────────────────────────────────────────────
    if req.task_type not in ("mcq", "coding", "assignment"):
        raise HTTPException(
            status_code=422,
            detail="task_type must be one of: mcq, coding, assignment",
        )
    if req.task_type == "mcq" and not req.options:
        raise HTTPException(status_code=422, detail="options is required for MCQ tasks")

    # ── 4. Create task record ──────────────────────────────────────────────
    task_row = {
        "user_id":   user["id"],
        "task_type": req.task_type,
        "title":     _make_title(req),
        "url":       req.url,
        "status":    "solving",
    }
    try:
        task_result = supabase.table("tasks").insert(task_row).execute()
        task_id: str = task_result.data[0]["id"]
    except Exception as exc:
        logger.error(f"[solve] Task insert error: {exc}")
        # Non-fatal — proceed without a task_id
        task_id = None  # type: ignore[assignment]

    logger.info(
        f"[solve] user={user['name']} type={req.task_type} "
        f"provider={user['llm_provider']} task={task_id}"
    )

    # ── 5. Run solver ──────────────────────────────────────────────────────
    solve_result = None
    run_error: str | None = None

    try:
        solve_result = await solver_svc.solve(
            provider=user["llm_provider"],
            api_key=llm_api_key,
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
        logger.error(f"[solve] Solver failed for task {task_id}: {exc}")

    # ── 6. Persist run record ──────────────────────────────────────────────
    if task_id:
        run_row: dict = {
            "task_id":       task_id,
            "user_id":       user["id"],
            "attempt":       (solve_result.attempts if solve_result else 1),
            "prompt":        (solve_result.prompt if solve_result else ""),
            "response":      (solve_result.answer if solve_result else None),
            "success":       solve_result is not None,
            "error_message": run_error,
            "tokens_used":   (solve_result.tokens_used if solve_result else None),
            "duration_ms":   (solve_result.duration_ms if solve_result else None),
        }
        try:
            supabase.table("runs").insert(run_row).execute()
        except Exception as exc:
            logger.warning(f"[solve] Run insert failed (non-fatal): {exc}")

    # ── 7. Update task status ──────────────────────────────────────────────
    if task_id:
        update = {
            "status":      "solved" if solve_result else "failed",
            "completed_at": _now_iso(),
        }
        if run_error and not solve_result:
            update["error_message"] = run_error[:500]
        try:
            supabase.table("tasks").update(update).eq("id", task_id).execute()
        except Exception as exc:
            logger.warning(f"[solve] Task status update failed (non-fatal): {exc}")

    # ── 8. Return ──────────────────────────────────────────────────────────
    if not solve_result:
        raise HTTPException(
            status_code=502,
            detail=f"Solver failed: {run_error or 'unknown error'}",
        )

    return SolveResponse(answer=solve_result.answer, task_id=task_id)
