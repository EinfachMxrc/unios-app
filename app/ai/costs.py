# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local, network-free cost estimate for AI packages: a rough character-based token guess."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.ai.access import allowed, course_access
from app.ai.prices import PriceList, load_prices
from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.timeutil import as_utc

CHARS_PER_TOKEN = 4


def eligible_text_length(session, since: datetime | None = None) -> int:
    if not allowed(session, "category:course_material"):
        return 0
    courses = session.scalars(select(Course)).all()
    permitted = course_access(session)
    permitted_course_ids = {course.id for course in courses if permitted(course.id)}
    if not permitted_course_ids:
        return 0
    # One query for the latest version per eligible resource (grouped by max version number,
    # matching the previous per-resource "order by version desc, limit 1" lookup)...
    latest_version = (
        select(ResourceVersion.resource_id, func.max(ResourceVersion.version).label("version"))
        .join(Resource, Resource.id == ResourceVersion.resource_id)
        .where(Resource.course_id.in_(permitted_course_ids), Resource.group_category != "other_group")
        .group_by(ResourceVersion.resource_id)
        .subquery()
    )
    version_rows = session.execute(
        select(ResourceVersion.id, ResourceVersion.downloaded_at)
        .join(latest_version, (latest_version.c.resource_id == ResourceVersion.resource_id)
              & (latest_version.c.version == ResourceVersion.version))
    ).all()
    eligible_version_ids = [version_id for version_id, downloaded_at in version_rows
                            if since is None or as_utc(downloaded_at) >= since]
    if not eligible_version_ids:
        return 0
    # ...and one query summing text length across all of them, instead of one query per resource.
    total = session.scalar(
        select(func.coalesce(func.sum(func.length(ResourceText.text)), 0))
        .where(ResourceText.version_id.in_(eligible_version_ids))
    )
    return int(total or 0)


def estimate_costs(session, prices: PriceList | None = None) -> dict:
    prices = prices or load_prices()
    total_chars = eligible_text_length(session)
    weekly_chars = eligible_text_length(session, since=datetime.now(UTC) - timedelta(weeks=4)) // 4
    tokens = total_chars // CHARS_PER_TOKEN
    weekly_tokens = weekly_chars // CHARS_PER_TOKEN
    models = []
    for price in prices.models:
        base = tokens / 1_000_000 * price.input_per_million
        weekly = weekly_tokens / 1_000_000 * price.input_per_million
        discount = 1 - price.batch_discount_percent / 100
        models.append({
            "model": price.name, "stale_price": prices.stale,
            "one_time_cost": round(base, 4), "one_time_cost_with_batch": round(base * discount, 4),
            "weekly_cost": round(weekly, 4), "weekly_cost_with_batch": round(weekly * discount, 4),
        })
    return {"price_as_of": prices.as_of.isoformat(), "estimated_tokens": tokens,
            "estimated_weekly_tokens": weekly_tokens, "models": models}
