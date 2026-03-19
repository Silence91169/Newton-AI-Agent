from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    name: str
    portal_username: str
    portal_password: str
    llm_provider: str = "anthropic"
    llm_api_key: str

class UserOut(BaseModel):
    id: str
    name: str
    api_token: str

class TaskOut(BaseModel):
    id: str
    user_id: str
    task_type: str
    title: str
    status: str
    score: Optional[str] = None
    detected_at: datetime
    completed_at: Optional[datetime] = None

class SolveRequest(BaseModel):
    api_token: str
    task_type: str
    question: str
    options: Optional[list[str]] = None
    language: Optional[str] = None
    constraints: Optional[str] = None
    sample_io: Optional[str] = None

class SolveResponse(BaseModel):
    answer: str
    task_id: Optional[str] = None