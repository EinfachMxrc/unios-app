# SPDX-License-Identifier: AGPL-3.0-or-later

"""Load config/ai_prices.yaml and flag entries Marc has not reviewed in a while."""

from datetime import UTC, date, datetime
from importlib.resources import files

import yaml
from pydantic import BaseModel, Field

STALE_AFTER_DAYS = 90


class ModelPrice(BaseModel):
    name: str
    input_per_million: float = Field(ge=0)
    output_per_million: float = Field(ge=0)
    batch_discount_percent: float = Field(ge=0, le=100)


class PriceList(BaseModel):
    as_of: date
    models: list[ModelPrice]

    @property
    def stale(self) -> bool:
        age = datetime.now(UTC).date() - self.as_of
        return age.days > STALE_AFTER_DAYS


def load_prices() -> PriceList:
    source = files("config").joinpath("ai_prices.yaml")
    return PriceList.model_validate(yaml.safe_load(source.read_text(encoding="utf-8")))
