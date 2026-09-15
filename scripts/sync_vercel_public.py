#!/usr/bin/env python3
"""Copy UI files into public/ so Vercel serves them from the CDN.

Flask on Vercel only handles /api/*. Local `python app.py` still serves
index.html and src/ from the repo root.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SRC_OUT = PUBLIC / "src"

UI_FILES = ("main.js", "render.js", "examples.js", "style.css")


def main() -> int:
    index = ROOT / "index.html"
    if not index.is_file():
        print(f"missing {index}", file=sys.stderr)
        return 1

    PUBLIC.mkdir(exist_ok=True)
    SRC_OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(index, PUBLIC / "index.html")
    for name in UI_FILES:
        src = ROOT / "src" / name
        if not src.is_file():
            print(f"missing {src}", file=sys.stderr)
            return 1
        shutil.copy2(src, SRC_OUT / name)
    print(f"synced UI → {PUBLIC}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
