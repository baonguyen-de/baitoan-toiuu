#!/usr/bin/env python3
"""Web: gọi cutting_stock.suggest_plans() rồi plot trên trình duyệt.

Vercel import `app` (WSGI). Local: python app.py
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from cutting_stock import SAMPLE, suggest_plans

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)


def _ui_dir() -> Path:
    """Vercel CDN copies UI into public/; local `python app.py` uses the repo root."""
    if os.environ.get("VERCEL"):
        public = ROOT / "public"
        if (public / "index.html").is_file():
            return public
    return ROOT


@app.get("/")
def index():
    return send_from_directory(_ui_dir(), "index.html")


@app.get("/src/<path:name>")
def src_files(name):
    return send_from_directory(_ui_dir() / "src", name)


@app.get("/api/sample")
def api_sample():
    return jsonify(SAMPLE)


@app.post("/api/suggest")
def api_suggest():
    data = request.get_json(silent=True) or {}
    allow_piece = data.get("allowPieceRotation")
    if allow_piece is None:
        allow_piece = data.get("allowRotation", True)
    result = suggest_plans(
        data.get("sheet") or {},
        data.get("items") or [],
        allow_rotation=bool(allow_piece),
        allow_piece_rotation=bool(allow_piece),
        allow_sheet_rotation=bool(data.get("allowSheetRotation", False)),
        trim_input=data.get("trim"),
        max_plans=int(data.get("maxPlans") or 6),
    )
    return jsonify(result)


def main():
    print("Thuật toán: cutting_stock.py  →  http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=True)


if __name__ == "__main__":
    main()
