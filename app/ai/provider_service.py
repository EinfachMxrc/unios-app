# SPDX-License-Identifier: AGPL-3.0-or-later

"""Connect an Anthropic API key and pick a model from the ones that key may use.

Nobody types model ids: the list comes from the provider, newest first, and the newest
one is preselected. The key is checked by listing models, which sends no study content.
"""

from collections.abc import Callable
from dataclasses import dataclass

from app.ai.adapter import AdapterCallError, NotConfiguredError
from app.ai.provider_repository import ProviderRepository
from app.config import Settings


@dataclass(frozen=True)
class ModelOption:
    id: str
    name: str


@dataclass(frozen=True)
class ProviderState:
    configured: bool
    model: str
    models: list[ModelOption]


def _client(api_key: str):
    try:
        import anthropic
    except ImportError as exc:
        raise NotConfiguredError("KI-Adapter braucht das optionale Paket: uv sync --extra ai") from exc
    return anthropic.Anthropic(api_key=api_key, max_retries=0, timeout=20.0)


def fetch_models(api_key: str, client_factory: Callable | None = None) -> list[ModelOption]:
    import anthropic

    try:
        page = (client_factory or _client)(api_key).models.list(limit=100)
        return [ModelOption(id=item.id, name=getattr(item, "display_name", None) or item.id)
                for item in page.data]
    except anthropic.AuthenticationError as exc:
        raise AdapterCallError("API-Schlüssel ungültig", status_code=422) from exc
    except anthropic.PermissionDeniedError as exc:
        raise AdapterCallError("Dieser API-Schlüssel darf keine Modelle abrufen", status_code=422) from exc
    except anthropic.RateLimitError as exc:
        raise AdapterCallError("Rate-Limit erreicht, später erneut versuchen", status_code=503) from exc
    except anthropic.APIStatusError as exc:
        raise AdapterCallError(f"KI-Anbieter meldete einen Fehler (Status {exc.status_code})",
                               status_code=502) from exc
    except anthropic.APIConnectionError as exc:
        raise AdapterCallError("Netzwerkfehler beim KI-Anbieter", status_code=503) from exc


class ProviderService:
    def __init__(self, settings: Settings, repository: ProviderRepository,
                 client_factory: Callable | None = None) -> None:
        self._settings = settings
        self._repository = repository
        self._client_factory = client_factory
        self._applied = False

    def apply_stored(self) -> None:
        """Load a saved key and choice into the running settings unless the environment set them.

        Runs on first use rather than at start-up, so a service that never touches the AI adapter
        never opens the credential store.
        """
        if self._settings.demo_mode:
            self._settings.ai_adapter_api_key = ""
            self._settings.ai_adapter_model = ""
            self._settings.ai_adapter_enabled = False
            return
        if self._applied:
            return
        self._applied = True
        settings = self._settings
        if not settings.ai_adapter_api_key:
            settings.ai_adapter_api_key = self._repository.load_key()
        choice = self._repository.load_choice()
        if not settings.ai_adapter_model:
            settings.ai_adapter_model = str(choice.get("model") or "")
        if settings.ai_adapter_api_key and settings.ai_adapter_model:
            settings.ai_adapter_enabled = True

    def state(self) -> ProviderState:
        self.apply_stored()
        key = self._settings.ai_adapter_api_key
        if not key:
            return ProviderState(False, "", [])
        models = fetch_models(key, self._client_factory)
        return ProviderState(True, self._settings.ai_adapter_model, models)

    def connect(self, api_key: str) -> ProviderState:
        self._require_connection_changes()
        key = api_key.strip()
        models = fetch_models(key, self._client_factory)
        if not models:
            raise AdapterCallError("Dieser Schlüssel hat Zugriff auf kein Modell", status_code=422)
        self._repository.save_key(key)
        self._settings.ai_adapter_api_key = key
        known = {option.id for option in models}
        if self._settings.ai_adapter_model not in known:
            self._select(models[0].id)  # the provider lists newest first
        self._settings.ai_adapter_enabled = True
        return ProviderState(True, self._settings.ai_adapter_model, models)

    def choose(self, model: str) -> ProviderState:
        self._require_connection_changes()
        state = self.state()
        if not state.configured:
            raise AdapterCallError("Zuerst einen API-Schlüssel verbinden", status_code=409)
        if model not in {option.id for option in state.models}:
            raise AdapterCallError("Dieses Modell steht für den Schlüssel nicht zur Verfügung", status_code=422)
        self._select(model)
        self._settings.ai_adapter_enabled = True
        return ProviderState(True, model, state.models)

    def disconnect(self) -> None:
        self._require_connection_changes()
        self._repository.delete_key()
        self._repository.save_choice({})
        self._settings.ai_adapter_api_key = ""
        self._settings.ai_adapter_model = ""
        self._settings.ai_adapter_enabled = False

    def _require_connection_changes(self) -> None:
        if self._settings.demo_mode:
            raise AdapterCallError("KI-Verbindungen sind im Demomodus deaktiviert", status_code=403)

    def _select(self, model: str) -> None:
        self._settings.ai_adapter_model = model
        self._repository.save_choice({"model": model})
