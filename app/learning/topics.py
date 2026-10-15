# SPDX-License-Identifier: AGPL-3.0-or-later

"""Find-or-create the shared learning topic behind exercises and Anki cards."""

from sqlalchemy import select

from app.db.models import LearningTopic


def resolve_topic(session, course_id: int, topic_name: str) -> LearningTopic:
    slug = topic_name.casefold()
    topic = session.scalar(select(LearningTopic).where(
        LearningTopic.course_id == course_id, LearningTopic.slug == slug))
    if topic is None:
        topic = LearningTopic(course_id=course_id, slug=slug, name=topic_name)
        session.add(topic)
        session.flush()
    return topic
