# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local Syncthing REST fixture for browser tests."""

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

app = FastAPI()
need_files = 0


class FolderState(BaseModel):
    need_files: int = Field(ge=0)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/rest/db/status")
def folder_status(folder: str = Query(), x_api_key: str = Header(default="")):
    if x_api_key != "fixture-syncthing-key":  # pragma: allowlist secret
        raise HTTPException(403)
    if folder != "fixture-uni-data":
        raise HTTPException(404)
    return {
        "state": "idle", "ignorePatterns": False, "needBytes": 0, "needDeletes": 0,
        "needDirectories": 0, "needFiles": need_files, "needSymlinks": 0,
        "needTotalItems": need_files, "pullErrors": 0, "receiveOnlyTotalItems": 0,
    }


@app.post("/__test__/folder-state")
def set_folder_state(state: FolderState):
    global need_files
    need_files = state.need_files
    return {"need_files": need_files}
