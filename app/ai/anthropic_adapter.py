# SPDX-License-Identifier: AGPL-3.0-or-later

"""Optional real AI provider (Stufe 3): Anthropic's official SDK, disabled unless configured.

Ships behind the ``ai`` extra (``uv sync --extra ai``) so the app runs without it installed;
importing the SDK lazily inside ``propose`` means a missing extra only ever surfaces as a
clear ``NotConfiguredError`` when someone actually tries to use this adapter.
"""

import logging

from app.ai.adapter import (
    AdapterCallError,
    AdapterResult,
    AiProviderAdapter,
    NotConfiguredError,
    NullAdapter,
)
from app.config import Settings

log = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Du bist ein Assistent für UniOS. Antworte ausschließlich mit einem einzigen JSON-Dokument "
    "im vorgegebenen Schema. Kein Freitext davor oder danach, keine Markdown-Codeblöcke, keine "
    "Erklärungen außerhalb des JSON."
)


class AnthropicAdapter:
    """Calls the Anthropic Messages API with the model the user chose in the app."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def maximum_billable_tokens(self, prompt: str, max_output_tokens: int) -> int:
        # Reserve the worst case of the single attempt: prompt, system prompt, request
        # framing and the output cap. No SDK retry may duplicate an ambiguously billed request.
        output_cap = max(max_output_tokens, self._settings.ai_adapter_max_output_tokens)
        return len(prompt.encode('utf-8')) + len(SYSTEM_PROMPT.encode('utf-8')) + 512 + output_cap

    def propose(self, prompt: str) -> AdapterResult:
        try:
            import anthropic
        except ImportError as exc:
            raise NotConfiguredError(
                "KI-Adapter braucht das optionale Paket: uv sync --extra ai") from exc

        settings = self._settings
        model = settings.ai_adapter_model
        if not model:
            raise NotConfiguredError("Kein KI-Modell gewählt")
        client = anthropic.Anthropic(api_key=settings.ai_adapter_api_key, max_retries=0, timeout=120.0)
        extra_kwargs: dict = {}
        if settings.ai_adapter_effort:
            extra_kwargs["output_config"] = {"effort": settings.ai_adapter_effort}
        try:
            response = client.messages.create(
                model=model,
                max_tokens=settings.ai_adapter_max_output_tokens,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                **extra_kwargs,
            )
        except anthropic.AuthenticationError as exc:
            # A rejected request is never billed; settling with 0 keeps the monthly budget intact.
            raise AdapterCallError("API-Schlüssel ungültig", status_code=502, tokens_used=0) from exc
        except anthropic.RateLimitError as exc:
            raise AdapterCallError("Rate-Limit erreicht, später erneut versuchen", status_code=503,
                                   tokens_used=0) from exc
        except anthropic.APIStatusError as exc:
            # 4xx means the provider refused before generating; 5xx may have been billed, so it stays uncertain.
            rejected = 400 <= exc.status_code < 500
            raise AdapterCallError(
                f"KI-Anbieter meldete einen Fehler (Status {exc.status_code})", status_code=502,
                tokens_used=0 if rejected else None) from exc
        except anthropic.APIConnectionError as exc:
            raise AdapterCallError("Netzwerkfehler beim KI-Anbieter", status_code=503) from exc

        usage = response.usage
        iterations = getattr(usage, 'iterations', None)
        entries = iterations or [usage]
        tokens_used = sum(getattr(entry, field, 0) or 0 for entry in entries for field in
                          ('input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'))
        actual_model = getattr(response, 'model', model)
        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None) if details is not None else None
            if category:
                log.warning("KI-Anfrage abgelehnt: %s", category)
            raise AdapterCallError("Die KI-Anfrage wurde abgelehnt", status_code=502,
                                   tokens_used=tokens_used, model=actual_model)
        if response.stop_reason == "max_tokens":
            raise AdapterCallError("Antwort abgeschnitten", status_code=502,
                                   tokens_used=tokens_used, model=actual_model)

        text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        return AdapterResult(model=actual_model, tokens_used=tokens_used, payload=text)


def select_adapter(settings: Settings) -> AiProviderAdapter:
    """Anthropic when enabled with a key configured, ``NullAdapter`` otherwise."""
    if settings.ai_adapter_enabled and settings.ai_adapter_api_key:
        return AnthropicAdapter(settings)
    return NullAdapter()
