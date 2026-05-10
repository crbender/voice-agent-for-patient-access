#!/usr/bin/env python3
"""Capture shareable UI screenshots from the local Riley demo.

Usage:
  python3 scripts/capture_ui_screenshots.py
  python3 scripts/capture_ui_screenshots.py --url http://127.0.0.1:8787 --output-dir screenshots

Prereqs:
  pip install playwright
  python3 -m playwright install chromium
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture Riley UI screenshots for sharing")
    parser.add_argument("--url", default="http://127.0.0.1:8787", help="Local demo URL")
    parser.add_argument(
        "--output-dir",
        default="screenshots",
        help="Directory where screenshots are written",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=2560,
        help="Viewport width in pixels",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=1440,
        help="Viewport height in pixels",
    )
    parser.add_argument(
        "--skip-server",
        action="store_true",
        help="Do not start server.py automatically",
    )
    parser.add_argument(
        "--server-cmd",
        default="python3 server.py",
        help="Server command used when --skip-server is not set",
    )
    parser.add_argument(
        "--startup-timeout",
        type=float,
        default=20.0,
        help="Seconds to wait for local server startup",
    )
    return parser.parse_args()


def wait_for_http(url: str, timeout_s: float) -> bool:
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            with urlopen(url, timeout=2.0) as response:  # nosec B310 - local demo endpoint only
                if 200 <= response.status < 500:
                    return True
        except URLError:
            time.sleep(0.3)
        except Exception:
            time.sleep(0.3)
    return False


def start_server(command: str, cwd: Path) -> subprocess.Popen[str]:
    return subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        text=True,
        env=os.environ.copy(),
    )


def ensure_output_dir(base_dir: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = base_dir / f"ui-capture-{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def save_screenshot(page, path: Path, locator: Optional[str] = None) -> None:
    if locator:
        page.locator(locator).first.screenshot(path=str(path))
    else:
        page.screenshot(path=str(path), full_page=True)
    print(f"Saved: {path}")


def capture(url: str, output_dir: Path, width: int, height: int) -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
            ],
        )
        context = browser.new_context(
            viewport={"width": width, "height": height},
            permissions=["microphone"],
        )
        page = context.new_page()

        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_selector("#patientApp", timeout=10000)
        page.wait_for_selector("#viewSwitch", timeout=10000)

        # 1) Patient primary UI shell
        save_screenshot(page, output_dir / "01-patient-view-full.png")

        # 2) Executive primary UI shell
        page.locator("#viewSwitch").click()
        page.wait_for_selector("#executiveApp[aria-hidden='false']", timeout=10000)
        page.wait_for_selector("#scenarioGrid", timeout=10000)
        save_screenshot(page, output_dir / "02-executive-view-full.png")

        # 3) Capture right-side supervisor panel (static primary UI)
        save_screenshot(
            page,
            output_dir / "03-realtime-status-panel.png",
            locator=".dashboard > aside.panel.stack:last-of-type",
        )

        # 4) Optional close-up of status text block
        save_screenshot(page, output_dir / "04-realtime-status-text.png", locator="#foundryDetail")

        context.close()
        browser.close()


def main() -> int:
    args = parse_args()
    repo_root = Path.cwd()
    output_root = (repo_root / args.output_dir).resolve()
    run_dir = ensure_output_dir(output_root)

    server_proc: Optional[subprocess.Popen[str]] = None
    if not args.skip_server:
        server_proc = start_server(args.server_cmd, repo_root)

    try:
        if not wait_for_http(args.url, args.startup_timeout):
            print(f"Server not reachable at {args.url} within {args.startup_timeout:.1f}s")
            if server_proc and server_proc.stdout:
                tail = server_proc.stdout.read()[-3000:]
                if tail:
                    print("\nServer output:\n" + tail)
            return 1

        capture(args.url, run_dir, args.width, args.height)
        print(f"\nDone. Screenshot set saved to: {run_dir}")
        return 0
    except PlaywrightTimeoutError as error:
        print(f"Playwright timed out: {error}")
        return 1
    finally:
        if server_proc and server_proc.poll() is None:
            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server_proc.kill()


if __name__ == "__main__":
    sys.exit(main())
