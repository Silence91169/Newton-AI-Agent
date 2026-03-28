"""
Newton AI Agent — Task history routes.

All endpoints require Bearer auth (api_token as token).

GET  /tasks               → paginated task list with optional filters
GET  /tasks/{task_id}     → single task + all its runs
POST /tasks               → manually create a task record (extension usage)
PATCH /tasks/{task_id}    → update task status / score
DELETE /tasks/{task_id}   → soft-delete (sets status=skipped)
GET  /tasks/stats         → aggregate stats for the authenticated user
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger

from app.db.supabase import supabase
from app.models.schemas import TaskCreate, TaskDetailOut, TaskOut, TaskUpdate, RunOut
from app.routes.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

UTC = timezone.utc
VALID_STATUSES = {"pending", "solving", "solved", "failed", "skipped"}
VALID_TYPES    = {"mcq", "coding", "assignment"}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── GET /tasks ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status:    Optional[str] = Query(default=None, description="Filter by status"),
    task_type: Optional[str] = Query(default=None, description="Filter by task_type"),
    page:      int           = Query(default=1,    ge=1),
    limit:     int           = Query(default=20,   ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Return paginated task list for the authenticated user, newest first."""
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {VALID_STATUSES}")
    if task_type and task_type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid task_type. Use: {VALID_TYPES}")

    offset = (page - 1) * limit

    try:
        q = (
            supabase.table("tasks")
            .select(
                "id, user_id, task_type, title, url, status, score, "
                "error_message, detected_at, completed_at"
            )
            .eq("user_id", user["id"])
            .order("detected_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if status:
            q = q.eq("status", status)
        if task_type:
            q = q.eq("task_type", task_type)

        result = q.execute()
    except Exception as exc:
        logger.error(f"[tasks/list] DB error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    return [TaskOut(**row) for row in (result.data or [])]


# ── GET /tasks/stats ──────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    """Return aggregate stats from the user_stats view."""
    try:
        result = (
            supabase.table("user_stats")
            .select("*")
            .eq("user_id", user["id"])
            .single()
            .execute()
        )
    except Exception as exc:
        logger.error(f"[tasks/stats] DB error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    return result.data or {
        "user_id":        user["id"],
        "total_tasks":    0,
        "total_solved":   0,
        "total_failed":   0,
        "success_rate":   None,
        "solved_today":   0,
        "mcq_count":      0,
        "coding_count":   0,
        "assignment_count": 0,
        "last_solved_at": None,
    }


# ── GET /tasks/{task_id} ──────────────────────────────────────────────────────

@router.get("/{task_id}", response_model=TaskDetailOut)
async def get_task(task_id: str, user: dict = Depends(get_current_user)):
    """Return a single task with all its run records."""
    try:
        task_result = (
            supabase.table("tasks")
            .select("*")
            .eq("id", task_id)
            .eq("user_id", user["id"])
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Task not found")

    if not task_result.data:
        raise HTTPException(status_code=404, detail="Task not found")

    task = task_result.data

    try:
        runs_result = (
            supabase.table("runs")
            .select(
                "id, task_id, attempt, prompt, response, success, "
                "error_message, tokens_used, duration_ms, created_at"
            )
            .eq("task_id", task_id)
            .order("attempt")
            .execute()
        )
        runs = [RunOut(**r) for r in (runs_result.data or [])]
    except Exception as exc:
        logger.warning(f"[tasks/get] Runs fetch failed (non-fatal): {exc}")
        runs = []

    return TaskDetailOut(**task, runs=runs)


# ── POST /tasks ───────────────────────────────────────────────────────────────

@router.post("", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, user: dict = Depends(get_current_user)):
    """Manually create a task record (called by the extension when it detects a task)."""
    if body.task_type not in VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"task_type must be one of: {VALID_TYPES}",
        )

    row = {
        "user_id":         user["id"],
        "task_type":       body.task_type,
        "title":           body.title,
        "url":             body.url,
        "course_hash":     body.course_hash,
        "assessment_hash": body.assessment_hash,
        "status":          "pending",
    }

    try:
        result = supabase.table("tasks").insert(row).execute()
    except Exception as exc:
        logger.error(f"[tasks/create] Insert error: {exc}")
        raise HTTPException(status_code=503, detail="Failed to create task")

    if not result.data:
        raise HTTPException(status_code=503, detail="Task insert returned no data")

    return TaskOut(**result.data[0])


# ── PATCH /tasks/{task_id} ────────────────────────────────────────────────────

@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str,
    body: TaskUpdate,
    user: dict = Depends(get_current_user),
):
    """Update task status, score, or error message."""
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {VALID_STATUSES}",
        )

    # Only update fields that were explicitly provided
    update: dict = {}
    if body.status is not None:
        update["status"] = body.status
        if body.status in ("solved", "failed", "skipped"):
            update["completed_at"] = _now_iso()
    if body.score is not None:
        update["score"] = body.score
    if body.error_message is not None:
        update["error_message"] = body.error_message
    if body.completed_at is not None:
        update["completed_at"] = body.completed_at.isoformat()

    if not update:
        raise HTTPException(status_code=422, detail="No fields to update")

    try:
        result = (
            supabase.table("tasks")
            .update(update)
            .eq("id", task_id)
            .eq("user_id", user["id"])
            .execute()
        )
    except Exception as exc:
        logger.error(f"[tasks/update] Error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskOut(**result.data[0])


# ── DELETE /tasks/{task_id} ───────────────────────────────────────────────────

@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    """Mark a task as skipped (soft delete)."""
    try:
        result = (
            supabase.table("tasks")
            .update({"status": "skipped", "completed_at": _now_iso()})
            .eq("id", task_id)
            .eq("user_id", user["id"])
            .execute()
        )
    except Exception as exc:
        logger.error(f"[tasks/delete] Error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
