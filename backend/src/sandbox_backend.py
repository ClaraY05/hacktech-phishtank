"""
Pluggable sandbox backend.

The pipeline (FastAPI -> orchestrator -> Gemma -> K2) only needs one
thing from the sandbox layer: ``async (url) -> SandboxResult``. By
hiding the implementation behind a small ``SandboxBackend`` protocol,
we can swap the underlying isolation strategy without touching ``main.py``
or the orchestrator.

Backends shipped:

* ``InProcessBackend`` — calls ``sandbox.capture()`` directly. Fast,
  no extra dependencies, **no host isolation**. Fine for local dev
  and for capturing URLs you already trust.

* ``DockerBackend`` — runs the sandbox image in a fresh Docker
  container per request, optionally under gVisor (``--runtime=runsc``,
  registered in ``/etc/docker/daemon.json`` — see ``backend/setup.sh``).
  Adds host-level isolation (namespaces, cgroups, dropped caps,
  read-only rootfs, optional kernel-syscall mediation). The container
  prints a ``SandboxResult`` JSON on stdout; we parse it back into the
  same ``TypedDict`` the in-process path returns.

Future backends slot in cleanly: an ``HTTPBackend`` that talks to a
long-running sandbox worker, a ``RemoteBackend`` that delegates to
another machine, a ``MockBackend`` for tests, etc. Pick the active
backend with the ``SANDBOX_BACKEND`` env var (see ``get_backend``).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from typing import Protocol, runtime_checkable

from sandbox import (
    CaptureError,
    SandboxResult,
    capture as inprocess_capture,
    shutdown_browser,
)


@runtime_checkable
class SandboxBackend(Protocol):
    """Anything that can turn a URL into a ``SandboxResult`` is a backend."""

    name: str

    async def __call__(self, url: str) -> SandboxResult: ...

    async def aclose(self) -> None:
        """Release backend-owned resources on app shutdown."""


class InProcessBackend:
    name = "inprocess"

    async def __call__(self, url: str) -> SandboxResult:
        return await inprocess_capture(url)

    async def aclose(self) -> None:
        await shutdown_browser()


class DockerBackend:
    """Run the sandbox image in a fresh Docker container per request.

    Defaults are deliberately strict:

    * ``--read-only`` rootfs + ``--tmpfs=/tmp`` for scratch
    * ``--cap-drop=ALL`` and ``--security-opt=no-new-privileges``
    * cgroup limits: 1 CPU, 1 GiB RAM, 200 PIDs
    * ``--runtime=runsc`` (gVisor) when available
    """

    name = "docker"

    def __init__(
        self,
        *,
        image: str,
        use_runsc: bool,
        timeout_s: float,
        docker_path: str,
        memory: str = "1g",
        cpus: str = "1.0",
        pids_limit: int = 200,
        tmpfs_size: str = "200m",
        network: str | None = None,
    ) -> None:
        self.image = image
        self.use_runsc = use_runsc
        self.timeout_s = timeout_s
        self.docker_path = docker_path
        self.memory = memory
        self.cpus = cpus
        self.pids_limit = pids_limit
        self.tmpfs_size = tmpfs_size
        self.network = network

    def _build_cmd(self, url: str) -> list[str]:
        cmd: list[str] = [
            self.docker_path, "run", "--rm",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            f"--memory={self.memory}",
            f"--cpus={self.cpus}",
            f"--pids-limit={self.pids_limit}",
            f"--tmpfs=/tmp:rw,size={self.tmpfs_size},exec",
        ]
        if self.use_runsc:
            cmd += ["--runtime=runsc"]
        if self.network:
            cmd += [f"--network={self.network}"]
        cmd += [self.image, url]
        return cmd

    async def __call__(self, url: str) -> SandboxResult:
        cmd = self._build_cmd(url)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise CaptureError(
                f"docker binary not found at {self.docker_path!r}: {exc}"
            ) from exc

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self.timeout_s
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise CaptureError(
                f"sandbox container timeout after {self.timeout_s}s for {url}"
            )

        if proc.returncode != 0:
            tail = stderr.decode(errors="replace")[-500:].strip()
            raise CaptureError(
                f"docker exit {proc.returncode} for {url}: {tail}"
            )

        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError as exc:
            head = stdout[:200].decode(errors="replace")
            raise CaptureError(
                f"sandbox container returned non-JSON: {exc}; head={head!r}"
            ) from exc

        if not isinstance(parsed, dict):
            raise CaptureError(
                f"sandbox container returned non-object JSON: {type(parsed).__name__}"
            )
        return parsed  # type: ignore[return-value]

    async def aclose(self) -> None:
        return None


def get_backend() -> SandboxBackend:
    """Choose the active backend from ``SANDBOX_BACKEND`` (default: inprocess).

    Env vars (DockerBackend only):
      * ``SANDBOX_IMAGE`` — image tag, default ``safe-link-worker``
      * ``USE_RUNSC`` — ``1`` to add ``--runtime=runsc`` (gVisor)
      * ``SANDBOX_TIMEOUT_S`` — wall-clock cap, default 30s
      * ``DOCKER_PATH`` — override docker binary location
      * ``SANDBOX_NETWORK`` — Docker network name (e.g. ``sandbox-egress``)
      * ``SANDBOX_MEMORY``, ``SANDBOX_CPUS``, ``SANDBOX_PIDS_LIMIT``,
        ``SANDBOX_TMPFS_SIZE`` — cgroup tunables
    """
    name = os.getenv("SANDBOX_BACKEND", "inprocess").strip().lower()

    if name == "inprocess":
        return InProcessBackend()

    if name == "docker":
        # Defaults match the image built by backend/Dockerfile; gVisor
        # opt-in (USE_RUNSC=1) until the host has runsc registered as
        # a docker runtime in /etc/docker/daemon.json — see
        # backend/setup.sh.
        return DockerBackend(
            image=os.getenv("SANDBOX_IMAGE", "safe-link-worker"),
            use_runsc=os.getenv("USE_RUNSC", "0") == "1",
            timeout_s=float(os.getenv("SANDBOX_TIMEOUT_S", "30")),
            docker_path=os.getenv("DOCKER_PATH", shutil.which("docker") or "docker"),
            memory=os.getenv("SANDBOX_MEMORY", "1g"),
            cpus=os.getenv("SANDBOX_CPUS", "1.0"),
            pids_limit=int(os.getenv("SANDBOX_PIDS_LIMIT", "200")),
            tmpfs_size=os.getenv("SANDBOX_TMPFS_SIZE", "200m"),
            network=os.getenv("SANDBOX_NETWORK") or None,
        )

    raise ValueError(
        f"Unknown SANDBOX_BACKEND={name!r}; expected 'inprocess' or 'docker'"
    )
