# SPDX-License-Identifier: AGPL-3.0-or-later

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["index", "ocr", "sync", "backup", "ai", "corpus", "coding"]
    target_id: int | None = Field(default=None, gt=0)
    mode: Literal["cards", "exercises"] = "cards"
    confirmed: Literal[True]

    @model_validator(mode="after")
    def target(self):
        if (self.kind in {"index", "ocr", "ai", "coding"}) != (self.target_id is not None):
            raise ValueError("Dieser Auftrag braucht eine passende Objektkennung")
        return self
