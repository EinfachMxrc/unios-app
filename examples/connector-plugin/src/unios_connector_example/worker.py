# SPDX-License-Identifier: AGPL-3.0-or-later

"""One-request stdio entrypoint for the networkless container example."""

from app.connectors.container_worker import serve
from unios_connector_example.connector import ExampleUniversityConnector


def main() -> None:
    serve(ExampleUniversityConnector)
