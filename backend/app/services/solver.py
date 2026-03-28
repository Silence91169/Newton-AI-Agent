"""
Newton AI Agent — Provider-agnostic LLM solver.

Supports Anthropic (Claude), OpenAI (GPT-4o), and Google (Gemini).
The caller passes the provider name and the decrypted API key; this module
handles prompt construction, provider dispatch, response validation, and retry.
"""
from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Optional

from loguru import logger

# ── Models used per provider ──────────────────────────────────────────────────
_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-6",
    "openai":    "gpt-4o",
    "gemini":    "gemini-2.0-flash",
    "groq":      "llama-3.3-70b-versatile",
}

MAX_TOKENS = 4096
TEMPERATURE = 0.0   # deterministic answers
MAX_RETRIES = 3


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class SolveResult:
    answer: str
    prompt: str
    tokens_used: Optional[int] = None
    duration_ms: Optional[int] = None
    attempts: int = 1
    errors: list[str] = field(default_factory=list)


# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_mcq_prompt(question: str, options: list[str]) -> str:
    labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
    opts = "\n".join(
        f"{labels[i]} ({i}): {o}" for i, o in enumerate(options)
    )
    return f"""\
You are an expert tutor. Answer this multiple choice question carefully.

Question: {question}

Options:
{opts}

Think through each option carefully, then on the very last line write ONLY the digit of the correct answer (0, 1, 2, or 3)."""


def _build_coding_prompt(
    question: str,
    language: str,
    starter_code: Optional[str],
    constraints: Optional[str],
    sample_io: Optional[str],
    error_context: Optional[str],
) -> str:
    parts: list[str] = [
        f"You are an expert competitive programmer. Solve the following problem in {language}.",
        "",
        "## Problem",
        question,
    ]

    if constraints:
        parts += ["", "## Constraints", constraints]

    if sample_io:
        parts += ["", "## Sample I/O", sample_io]

    if starter_code:
        parts += [
            "",
            "## Starter Code",
            "Fill in the implementation below. "
            "Do NOT rename or remove any function/class/interface.",
            f"```{language}",
            starter_code,
            "```",
        ]

    if error_context:
        parts += [
            "",
            "## Previous Attempt Failed",
            "Fix the bug. The error output was:",
            error_context,
        ]

    parts += [
        "",
        "## Instructions",
        f"- Return ONLY the complete, runnable {language} code.",
        "- Preserve all function signatures and class definitions from the starter code.",
        "- Do NOT redefine types or interfaces already declared in the starter code.",
        "- Do NOT wrap the code in markdown fences.",
        "- Do NOT include any explanation before or after the code.",
    ]

    return "\n".join(parts)


def _build_assignment_prompt(
    question: str,
    constraints: Optional[str],
) -> str:
    parts = [
        "You are an expert student assistant. Answer the following assignment question.",
        "",
        "Question:",
        question,
    ]
    if constraints:
        parts += ["", f"Constraints / format requirements:\n{constraints}"]
    parts += [
        "",
        "Instructions:",
        "- Write a clear, accurate, well-structured answer.",
        "- Do not include meta-commentary or preamble — start with the answer directly.",
    ]
    return "\n".join(parts)


# ── Response validators ───────────────────────────────────────────────────────

def _validate_mcq(raw: str, num_options: int) -> str:
    """Extract the last valid option index from the model response.

    The prompt asks the model to reason first and put the final digit on the
    last line, so we scan from the end of the response to find it.
    """
    raw = raw.strip()

    # Walk digits from the end — the answer digit comes after the reasoning
    for ch in reversed(raw):
        if ch.isdigit():
            idx = int(ch)
            if 0 <= idx < num_options:
                return str(idx)

    # Fallback: last A-D letter, then last bare digit anywhere
    for pat in [r"\b([A-D])\b", r"\b(\d)\b"]:
        matches = re.findall(pat, raw, re.IGNORECASE)
        if matches:
            token = matches[-1]  # take the last match
            idx = int(token) if token.isdigit() else ord(token.upper()) - ord('A')
            if 0 <= idx < num_options:
                return str(idx)

    raise ValueError(f"Could not extract a valid option index from: {raw!r}")


def _validate_coding(raw: str) -> str:
    """Strip markdown fences if the model wrapped the code."""
    raw = raw.strip()
    # Remove ```lang ... ``` or ``` ... ```
    fence_re = re.compile(r"^```[a-zA-Z0-9+#]*\n(.*?)```\s*$", re.DOTALL)
    m = fence_re.match(raw)
    if m:
        return m.group(1).strip()
    # Remove single trailing ``` if present
    raw = re.sub(r"```\s*$", "", raw).strip()
    raw = re.sub(r"^```[a-zA-Z0-9+#]*\n?", "", raw).strip()
    return raw


def _validate_assignment(raw: str) -> str:
    return raw.strip()


# ── Provider implementations ──────────────────────────────────────────────────

async def _call_anthropic(api_key: str, prompt: str) -> tuple[str, Optional[int]]:
    import anthropic  # lazy import — not installed on all envs

    client = anthropic.AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model=_MODELS["anthropic"],
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text if msg.content else ""
    tokens = (msg.usage.input_tokens or 0) + (msg.usage.output_tokens or 0)
    return text, tokens


async def _call_openai(api_key: str, prompt: str) -> tuple[str, Optional[int]]:
    import openai  # lazy import

    client = openai.AsyncOpenAI(api_key=api_key)
    resp = await client.chat.completions.create(
        model=_MODELS["openai"],
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.choices[0].message.content or ""
    tokens = resp.usage.total_tokens if resp.usage else None
    return text, tokens


async def _call_groq(api_key: str, prompt: str) -> tuple[str, Optional[int]]:
    import openai  # Groq is OpenAI-compatible — reuse the AsyncOpenAI client

    client = openai.AsyncOpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )
    resp = await client.chat.completions.create(
        model=_MODELS["groq"],
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.choices[0].message.content or ""
    tokens = resp.usage.total_tokens if resp.usage else None
    return text, tokens


async def _call_gemini(api_key: str, prompt: str) -> tuple[str, Optional[int]]:
    import google.generativeai as genai  # lazy import

    def _sync():
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            _MODELS["gemini"],
            generation_config=genai.types.GenerationConfig(
                temperature=TEMPERATURE,
                max_output_tokens=MAX_TOKENS,
            ),
        )
        resp = model.generate_content(prompt)
        return resp.text, None  # Gemini SDK doesn't expose token counts easily

    return await asyncio.to_thread(_sync)


_PROVIDER_DISPATCH = {
    "anthropic": _call_anthropic,
    "openai":    _call_openai,
    "gemini":    _call_gemini,
    "groq":      _call_groq,
}


# ── Public API ────────────────────────────────────────────────────────────────

async def solve(
    *,
    provider: str,
    api_key: str,
    task_type: str,
    question: str,
    options: Optional[list[str]] = None,
    language: Optional[str] = None,
    starter_code: Optional[str] = None,
    constraints: Optional[str] = None,
    sample_io: Optional[str] = None,
    error_context: Optional[str] = None,
) -> SolveResult:
    """
    Solve a question using the specified LLM provider.

    Returns a SolveResult with the validated answer, prompt, and metadata.
    Retries up to MAX_RETRIES times on validation or network errors.
    """
    provider = provider.lower()
    if provider not in _PROVIDER_DISPATCH:
        raise ValueError(f"Unknown LLM provider: {provider!r}. Use anthropic/openai/gemini/groq.")

    # Build prompt once (error_context is passed in; caller rebuilds if retrying)
    if task_type == "mcq":
        if not options:
            raise ValueError("options is required for MCQ tasks")
        prompt = _build_mcq_prompt(question, options)
    elif task_type == "coding":
        prompt = _build_coding_prompt(
            question, language or "python", starter_code,
            constraints, sample_io, error_context,
        )
    elif task_type == "assignment":
        prompt = _build_assignment_prompt(question, constraints)
    else:
        raise ValueError(f"Unknown task_type: {task_type!r}. Use mcq/coding/assignment.")

    call_fn = _PROVIDER_DISPATCH[provider]
    errors: list[str] = []

    for attempt in range(1, MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            raw, tokens = await call_fn(api_key, prompt)
            duration_ms = int((time.monotonic() - t0) * 1000)

            # Validate & clean response
            if task_type == "mcq":
                answer = _validate_mcq(raw, len(options))  # type: ignore[arg-type]
            elif task_type == "coding":
                answer = _validate_coding(raw)
                if not answer.strip():
                    raise ValueError("Solver returned empty code")
            else:
                answer = _validate_assignment(raw)

            logger.info(
                f"[solver] {provider} solved {task_type} in {duration_ms}ms "
                f"(attempt {attempt}, tokens={tokens})"
            )
            return SolveResult(
                answer=answer,
                prompt=prompt,
                tokens_used=tokens,
                duration_ms=duration_ms,
                attempts=attempt,
                errors=errors,
            )

        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            err_msg = f"Attempt {attempt}: {type(exc).__name__}: {exc}"
            errors.append(err_msg)
            logger.warning(f"[solver] {err_msg}")

            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** (attempt - 1))  # 1s, 2s
            else:
                raise RuntimeError(
                    f"Solver failed after {MAX_RETRIES} attempts. "
                    f"Last error: {exc}"
                ) from exc

    # Unreachable, but satisfies type checkers
    raise RuntimeError("Solver loop exited unexpectedly")
