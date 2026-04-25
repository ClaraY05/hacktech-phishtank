# Microsoft's official Playwright Python image. Chromium + every
# OS-level dependency Playwright needs are already installed and
# pinned to a known-good combination, so we don't have to fight
# `playwright install` on slim-bullseye.
FROM mcr.microsoft.com/playwright/python:v1.58.0-noble

# PYTHONUNBUFFERED=1     -> stdout flushes immediately so the parent
#                           podman process sees worker output without
#                           waiting for buffering.
# PYTHONDONTWRITEBYTECODE=1 -> no .pyc clutter in the read-only image.
# PYTHONPATH points at our /src so `from sandbox import ...` works.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="/home/pwuser/app/src"

WORKDIR /home/pwuser/app

# Copy build config first so the pip install layer is cached when
# only source files change.
COPY pyproject.toml ./

COPY src/ ./src/

RUN pip install --no-cache-dir .

# The base image ships a non-root `pwuser` account; chown the app
# tree to it and drop privileges before exec.
RUN chown -R pwuser:pwuser /home/pwuser/app
USER pwuser

# One-shot worker. Receives the URL as the container argument and
# prints a SandboxResult JSON document on stdout. Status / error
# messages go to stderr.
#
#   podman run --rm safe-link-worker https://example.com
#   podman run --rm --runtime=runsc safe-link-worker https://example.com
ENTRYPOINT ["python", "src/worker.py"]
