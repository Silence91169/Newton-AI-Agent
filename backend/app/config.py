"""
Newton AI Agent — Central configuration.
All environment variables are loaded here; import from this module everywhere else.
"""
from __future__ import annotations

import base64
import os
import secrets
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

load_dotenv()

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")   # service-role key

# ── AES-256-GCM encryption key ────────────────────────────────────────────────
# Must be a 64-character hex string (= 32 raw bytes).
# Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"
_aes_hex: str = os.getenv("AES_SECRET_KEY", "")

if _aes_hex and len(_aes_hex) != 64:
    sys.exit(
        f"[config] AES_SECRET_KEY must be 64 hex chars (32 bytes). "
        f"Got {len(_aes_hex)} chars."
    )

# Use a zeroed key in development if none is set (encrypts, but not secure).
_AES_KEY_BYTES: bytes = bytes.fromhex(_aes_hex) if _aes_hex else b"\x00" * 32
_AESGCM = AESGCM(_AES_KEY_BYTES)


def encrypt(plaintext: str) -> str:
    """AES-256-GCM encrypt. Returns base64url-encoded nonce‖ciphertext."""
    nonce = secrets.token_bytes(12)
    ct = _AESGCM.encrypt(nonce, plaintext.encode(), None)
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt(ciphertext_b64: str) -> str:
    """AES-256-GCM decrypt. Inverse of encrypt()."""
    raw = base64.urlsafe_b64decode(ciphertext_b64)
    nonce, ct = raw[:12], raw[12:]
    return _AESGCM.decrypt(nonce, ct, None).decode()


# ── Misc ──────────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
BACKEND_URL: str        = os.getenv("BACKEND_URL", "http://localhost:8000")
ENVIRONMENT: str        = os.getenv("ENVIRONMENT", "development")

# Comma-separated list of allowed CORS origins, or "*" for all.
# chrome-extension://* origins are handled by setting allow_origins=["*"]
# with allow_credentials=False in main.py — the wildcard is the only way
# to cover arbitrary extension IDs without enumerating them.
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
]
