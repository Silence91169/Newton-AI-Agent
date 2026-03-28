"""
Newton AI Agent — Auth routes.

POST /auth/register   → create user, return api_token
POST /auth/login      → return api_token for existing user (by portal credentials)
GET  /auth/verify     → validate Bearer token, return user info
"""
from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from loguru import logger

from fastapi import Depends

from app.config import decrypt, encrypt
from app.db.supabase import supabase
from app.models.schemas import LoginRequest, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Dependency — reusable across other route modules ──────────────────────────

async def get_current_user(authorization: str = Header(default=None)) -> dict[str, Any]:
    """
    FastAPI dependency.  Extracts Bearer token from the Authorization header
    and returns the matching users row (raw dict from Supabase).
    Raises HTTP 401 on missing / invalid token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty API token")

    try:
        result = (
            supabase.table("users")
            .select("*")
            .eq("api_token", token)
            .single()
            .execute()
        )
    except Exception as exc:
        logger.error(f"[auth] DB error during token lookup: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid API token")

    return result.data


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserCreate):
    """Create a new student account. Returns the generated api_token."""

    # Check for duplicate portal username
    try:
        existing = (
            supabase.table("users")
            .select("id")
            .eq("portal_username", body.portal_username)
            .execute()
        )
    except Exception as exc:
        logger.error(f"[auth/register] DB error: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"A user with portal username '{body.portal_username}' already exists",
        )

    # Validate llm_provider
    if body.llm_provider not in ("anthropic", "openai", "gemini", "groq"):
        raise HTTPException(
            status_code=422,
            detail="llm_provider must be one of: anthropic, openai, gemini, groq",
        )

    api_token = f"naa_{secrets.token_urlsafe(32)}"

    row = {
        "name":                body.name,
        "portal_username":     body.portal_username,
        "portal_password_enc": encrypt(body.portal_password),
        "llm_provider":        body.llm_provider,
        "llm_api_key_enc":     encrypt(body.llm_api_key),
        "api_token":           api_token,
        "telegram_chat_id":    body.telegram_chat_id,
    }

    try:
        result = supabase.table("users").insert(row).execute()
    except Exception as exc:
        logger.error(f"[auth/register] Insert error: {exc}")
        raise HTTPException(status_code=503, detail="Failed to create user")

    if not result.data:
        raise HTTPException(status_code=503, detail="User insert returned no data")

    user = result.data[0]
    logger.info(f"[auth/register] New user: {user['name']} ({user['id']})")

    return UserOut(
        id=user["id"],
        name=user["name"],
        portal_username=user["portal_username"],
        llm_provider=user["llm_provider"],
        enabled=user.get("is_active", True),
        api_token=user["api_token"],
        created_at=user["created_at"],
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest):
    """
    Return the api_token for an existing user identified by portal credentials.
    Verifies the password by decrypting the stored ciphertext.
    """
    try:
        result = (
            supabase.table("users")
            .select("*")
            .eq("portal_username", body.portal_username)
            .single()
            .execute()
        )
    except Exception:
        # .single() raises if 0 or >1 rows found
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = result.data

    # Constant-time-ish comparison to avoid timing leaks
    try:
        stored_password = decrypt(user["portal_password_enc"])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to verify credentials")

    if not secrets.compare_digest(stored_password, body.portal_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.info(f"[auth/login] {user['name']} ({user['id']})")

    return UserOut(
        id=user["id"],
        name=user["name"],
        portal_username=user["portal_username"],
        llm_provider=user["llm_provider"],
        enabled=user.get("is_active", True),
        api_token=user["api_token"],
        created_at=user["created_at"],
    )


# ── Verify ────────────────────────────────────────────────────────────────────

@router.get("/verify", response_model=UserOut)
async def verify(user: dict = Depends(get_current_user)):
    """Validate the Bearer token and return user info. Used by the extension popup."""
    return UserOut(
        id=user["id"],
        name=user["name"],
        portal_username=user["portal_username"],
        llm_provider=user["llm_provider"],
        enabled=user.get("is_active", True),
        api_token=user["api_token"],
        created_at=user["created_at"],
    )


# ── Update LLM settings ───────────────────────────────────────────────────────

@router.patch("/update", response_model=UserOut)
async def update(body: UserUpdate, user: dict = Depends(get_current_user)):
    """Update llm_provider and/or llm_api_key for the authenticated user."""

    if body.llm_provider is None and body.llm_api_key is None:
        raise HTTPException(status_code=422, detail="Provide at least one field to update")

    if body.llm_provider is not None and body.llm_provider not in ("anthropic", "openai", "gemini", "groq"):
        raise HTTPException(
            status_code=422,
            detail="llm_provider must be one of: anthropic, openai, gemini, groq",
        )

    patch: dict = {}
    if body.llm_provider is not None:
        patch["llm_provider"] = body.llm_provider
    if body.llm_api_key is not None:
        patch["llm_api_key_enc"] = encrypt(body.llm_api_key)

    try:
        result = (
            supabase.table("users")
            .update(patch)
            .eq("id", user["id"])
            .execute()
        )
    except Exception as exc:
        logger.error(f"[auth/update] DB error for user {user['id']}: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    updated = result.data[0]
    logger.info(f"[auth/update] {updated['name']} ({updated['id']}) updated LLM settings")

    return UserOut(
        id=updated["id"],
        name=updated["name"],
        portal_username=updated["portal_username"],
        llm_provider=updated["llm_provider"],
        enabled=updated.get("is_active", True),
        api_token=updated["api_token"],
        created_at=updated["created_at"],
    )
