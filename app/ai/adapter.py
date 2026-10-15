# SPDX-License-Identifier: AGPL-3.0-or-later

"""Optional, disabled-by-default AI adapter (Stufe 3): budget-gated, provider-agnostic.

``NullAdapter`` ships as the default and sends nothing anywhere. ``AnthropicAdapter``
(``app/ai/anthropic_adapter.py``) is the first real ``AiProviderAdapter`` implementation;
it only runs when explicitly enabled and configured with a key. Any other provider can be
added the same way by implementing ``AiProviderAdapter``; the budget gate and outbox
landing stay unchanged either way.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.ai.budget_repository import BudgetRepository, committed_tokens, reserved_tokens
from app.config import Settings


class NotConfiguredError(Exception):
    """Raised by NullAdapter: no real provider is wired up."""


@dataclass
class AdapterResult:
    model: str
    tokens_used: int
    payload: str  # JSON string in the outbox format from Bauauftrag 19.5


class AiProviderAdapter(Protocol):
    def propose(self, prompt: str) -> AdapterResult: ...


class NullAdapter:
    """Ships by default. Sends nothing anywhere; only proves the gate works without a key."""

    def propose(self, prompt: str) -> AdapterResult:
        raise NotConfiguredError("Kein KI-Anbieter eingerichtet")


class BudgetExceededError(Exception):
    pass


class AdapterCallError(Exception):
    """A configured provider was called but failed; carries the HTTP status to report."""

    def __init__(self, message: str, status_code: int = 502, *, tokens_used: int | None = None,
                 model: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.tokens_used = tokens_used
        self.model = model


def month_key(now: datetime) -> str:
    return f"{now.year:04d}-{now.month:02d}"


def tokens_used_this_month(session, settings: Settings, model: str, now: datetime) -> int:
    """Total usage across all models: the monthly budget is one hard cap, not per model."""
    return committed_tokens(session, month_key(now)) + reserved_tokens(session, month_key(now))


def submit(session, settings: Settings, adapter: AiProviderAdapter, model: str, prompt: str,
          max_output_tokens: int, now: datetime | None = None) -> AdapterResult:
    """Enforce enable flag and hard monthly budget before ever calling the adapter.

    Provider implementations must include framing/fallback in their reservation
    bound and obey the output cap. Reservation is committed before network I/O;
    unknown billing keeps the claim blocked, including after restart.
    """
    if not settings.ai_adapter_enabled:
        raise BudgetExceededError("KI-Adapter ist ausgeschaltet")
    now = now or datetime.now(UTC)
    budget = settings.ai_adapter_monthly_budget_tokens
    if max_output_tokens < 0:
        raise ValueError('Output token limit must be non-negative')
    # UTF-8 bytes are deliberately conservative for byte-based tokenizers. A
    # provider adds its system/framing and fallback allowance to this bound.
    bound = getattr(adapter, 'maximum_billable_tokens', None)
    reservation = bound(prompt, max_output_tokens) if bound else len(prompt.encode('utf-8')) + max_output_tokens
    if not isinstance(reservation, int) or reservation < 0:
        raise ValueError('Invalid provider reservation')
    repository = BudgetRepository(session.get_bind())
    claim = repository.reserve(month_key(now), model, reservation, budget, now)
    if claim is None:
        raise BudgetExceededError("Anfrage würde das Monatsbudget überschreiten; nichts wurde gesendet")
    try:
        result = adapter.propose(prompt)
    except NotConfiguredError:
        repository.finish(claim, model, None, not_sent=True)
        raise
    except AdapterCallError as exc:
        repository.finish(claim, exc.model or model, exc.tokens_used)
        raise
    except BaseException:
        repository.finish(claim, model, None)
        raise
    repository.finish(claim, result.model, result.tokens_used)
    return result
