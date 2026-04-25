"""
Container entrypoint for the safe-link sandbox image.

Receives a single URL on argv, runs the rich async ``capture()`` from
``sandbox.py``, and prints the resulting ``SandboxResult`` JSON document
on stdout. This is the wire format ``sandbox_backend.PodmanBackend``
parses back into a dict on the host side.

Two design choices deliberately match what the host expects:

* **Stdout is JSON only.** All progress / error chatter goes to stderr
  so the parent ``podman run`` invocation can be ``json.loads()``'d
  without filtering.
* **Exit code reflects capture viability.** Non-zero exit when no
  ``screenshot_b64`` could be produced (the host treats that as a
  ``CaptureError``); zero exit otherwise, even if the SandboxResult
  contains a soft ``error`` field (e.g. nav timeout but we still got a
  partial DOM dump).
"""

from __future__ import annotations

import asyncio
import json
import sys

from sandbox import CaptureError, capture, shutdown_browser


async def _run(url: str) -> int:
    try:
        result = await capture(url)
    except CaptureError as exc:
        print(f"capture error: {exc}", file=sys.stderr)
        json.dump({"url": url, "error": str(exc), "screenshot_b64": None}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    finally:
        await shutdown_browser()

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0 if result.get("screenshot_b64") else 1


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: worker.py <url>", file=sys.stderr)
        json.dump({"error": "no url provided"}, sys.stdout)
        sys.stdout.write("\n")
        sys.exit(64)  # EX_USAGE

    url = sys.argv[1]
    sys.exit(asyncio.run(_run(url)))


if __name__ == "__main__":
    main()
