# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP surface for connecting an AI provider key and choosing its model."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.adapter import AdapterCallError, NotConfiguredError
from app.ai.provider_repository import ProviderRepository
from app.ai.provider_service import ProviderService, ProviderState
from app.config import Settings
from app.host.lease import HostCoordinator


class ModelOptionView(BaseModel):
    id: str
    name: str


class ProviderStateView(BaseModel):
    configured: bool
    model: str
    models: list[ModelOptionView]


class ConnectRequest(BaseModel):
    api_key: str = Field(min_length=8, max_length=400, repr=False)


class ChooseModelRequest(BaseModel):
    model: str = Field(min_length=1, max_length=200)


def _view(state: ProviderState) -> ProviderStateView:
    return ProviderStateView(configured=state.configured, model=state.model,
                             models=[ModelOptionView(id=item.id, name=item.name) for item in state.models])


def provider_router(settings: Settings, coordinator: HostCoordinator,
                    service: ProviderService | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/ai/provider")
    provider = service or ProviderService(settings, ProviderRepository(settings))

    def guarded(action):
        try:
            return action()
        except NotConfiguredError as exc:
            raise HTTPException(503, str(exc)) from exc
        except AdapterCallError as exc:
            raise HTTPException(exc.status_code, str(exc)) from exc

    @router.get("", response_model=ProviderStateView)
    def get_state():
        return _view(guarded(provider.state))

    @router.put("/key", response_model=ProviderStateView)
    def connect(payload: ConnectRequest):
        coordinator.assert_writer()
        return _view(guarded(lambda: provider.connect(payload.api_key)))

    @router.put("/model", response_model=ProviderStateView)
    def choose(payload: ChooseModelRequest):
        coordinator.assert_writer()
        return _view(guarded(lambda: provider.choose(payload.model)))

    @router.delete("/key", status_code=204)
    def disconnect():
        coordinator.assert_writer()
        provider.disconnect()

    return router
