# SPDX-License-Identifier: AGPL-3.0-or-later
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.12.21 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /usr/local/bin/uv
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/unios-browsers
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --extra mcp --extra voice --extra ai --extra portals \
    && .venv/bin/playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr-deu tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
COPY app/ app/
COPY config/ config/
COPY institutions/ institutions/
COPY clients/ clients/
COPY desktop/backend.py desktop/backend.py
COPY alembic/ alembic/
COPY alembic.ini ./
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY docs/licenses/ third-party-licenses/
RUN uv sync --frozen --no-dev --extra mcp --extra voice --extra ai --extra portals \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin unios
COPY --from=frontend /frontend/dist /app/frontend/dist
RUN chmod -R a+rX /app/app /app/config /app/institutions /app/clients /app/desktop /app/alembic /app/third-party-licenses \
    && chmod a+r /app/alembic.ini /app/LICENSE /app/THIRD_PARTY_NOTICES.md
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
CMD ["python", "-m", "app.server", "serve"]
