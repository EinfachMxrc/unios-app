# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fetch a small, read-only GitHub snapshot for a linked project."""

import re
from collections import Counter
from datetime import datetime

import httpx
from fastapi import HTTPException
from pydantic import BaseModel


class GitHubEntry(BaseModel):
    title: str
    url: str
    actor: str | None = None
    at: datetime | None = None
    state: str | None = None


class MemberActivity(BaseModel):
    name: str
    github_username: str
    commits: int
    issues: int
    pull_requests: int


class GitHubActivity(BaseModel):
    repository: str
    commits: list[GitHubEntry]
    issues: list[GitHubEntry]
    pull_requests: list[GitHubEntry]
    branches: list[str]
    members: list[MemberActivity]
    fetched_at: datetime


def valid_repository(value: str) -> bool:
    owner, separator, repo = value.partition("/")
    return bool(separator and re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", owner)
                and re.fullmatch(r"[A-Za-z0-9_.-]+", repo) and repo not in {".", ".."})


def _list(client: httpx.Client, repository: str, kind: str) -> list[dict]:
    try:
        params: dict[str, str | int] = {"per_page": 20}
        if kind in {"issues", "pulls"}:
            params["state"] = "all"
        response = client.get(f"/repos/{repository}/{kind}", params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "GitHub ist derzeit nicht erreichbar") from exc
    if response.status_code in {401, 403}:
        raise HTTPException(502, "GitHub-Token oder Leserechte prüfen")
    if response.status_code == 404:
        raise HTTPException(502, "GitHub-Repository nicht erreichbar oder nicht freigegeben")
    if response.status_code != 200:
        raise HTTPException(502, "GitHub konnte nicht gelesen werden")
    try:
        items = response.json()
    except ValueError as exc:
        raise HTTPException(502, "Ungültige Antwort von GitHub") from exc
    if not isinstance(items, list):
        raise HTTPException(502, "Ungültige Antwort von GitHub")
    return items


def fetch_activity(repository: str, members: list[dict], token: str) -> GitHubActivity:
    # Validate saved values too; an older database might contain an unchecked path.
    if not valid_repository(repository):
        raise HTTPException(422, "Ungültige Repository-Adresse")
    headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
               "X-GitHub-Api-Version": "2026-03-10"}
    with httpx.Client(base_url="https://api.github.com", headers=headers, timeout=8,
                      follow_redirects=False, trust_env=False) as client:
        raw_commits = _list(client, repository, "commits")
        raw_issues = _list(client, repository, "issues")
        raw_pulls = _list(client, repository, "pulls")
        raw_branches = _list(client, repository, "branches")

    def actor(item: dict) -> str | None:
        user = item.get("user") or item.get("author")
        return user.get("login") if isinstance(user, dict) else None

    repository_url = f"https://github.com/{repository}"

    commits = [GitHubEntry(title=(item.get("commit") or {}).get("message", "").split("\n", 1)[0],
                           url=f"{repository_url}/commit/{item['sha']}" if re.fullmatch(r"[0-9a-f]{40}", str(item.get("sha", ""))) else repository_url,
                           actor=actor(item),
                           at=((item.get("commit") or {}).get("author") or {}).get("date"))
               for item in raw_commits]
    issues = [GitHubEntry(title=item.get("title", ""), url=f"{repository_url}/issues/{item['number']}", actor=actor(item),
                          at=item.get("updated_at"), state=item.get("state"))
              for item in raw_issues if "pull_request" not in item and isinstance(item.get("number"), int)]
    pulls = [GitHubEntry(title=item.get("title", ""), url=f"{repository_url}/pull/{item['number']}", actor=actor(item),
                         at=item.get("updated_at"), state=item.get("state"))
             for item in raw_pulls if isinstance(item.get("number"), int)]
    branches = [item["name"] for item in raw_branches if isinstance(item.get("name"), str)]
    counts = [Counter(entry.actor.lower() for entry in group if entry.actor) for group in (commits, issues, pulls)]
    member_activity = [MemberActivity(name=member["name"], github_username=member["github_username"],
                                      commits=counts[0][member["github_username"].lower()],
                                      issues=counts[1][member["github_username"].lower()],
                                      pull_requests=counts[2][member["github_username"].lower()])
                       for member in members if member.get("github_username")]
    return GitHubActivity(repository=repository, commits=commits, issues=issues, pull_requests=pulls,
                          branches=branches, members=member_activity, fetched_at=datetime.now().astimezone())
