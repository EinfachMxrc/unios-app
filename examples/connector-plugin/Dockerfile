# SPDX-License-Identifier: AGPL-3.0-or-later
# Build from the repository root: docker build -f examples/connector-plugin/Dockerfile .
FROM python:3.13-slim
WORKDIR /opt/unios
COPY app/__init__.py app/__init__.py
COPY app/connectors/__init__.py app/connectors/__init__.py
COPY app/connectors/base.py app/connectors/base.py
COPY app/connectors/manifest.py app/connectors/manifest.py
COPY app/connectors/sdk.py app/connectors/sdk.py
COPY app/connectors/container_worker.py app/connectors/container_worker.py
COPY examples/connector-plugin /opt/unios/plugin
RUN pip install --no-cache-dir pydantic httpx /opt/unios/plugin
ENV PYTHONPATH=/opt/unios
CMD ["unios-connector-worker"]
