"""
Newton AI Agent — Auth routes (retired).

The api_token registration system has been removed. Users are auto-registered
on first solve via their Newton portal JWT identity. See routes/solve.py.

This file is kept as an empty router stub so that existing imports in
tasks.py don't cause startup errors during the transition.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])
