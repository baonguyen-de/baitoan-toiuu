#!/usr/bin/env python3
"""Web: gọi cutting_stock.suggest_plans() rồi plot trên trình duyệt."""

from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from cutting_stock import SAMPLE, suggest_plans

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/src/<path:name>")
def src_files(name):
    return send_from_directory(ROOT / "src", name)


@app.get("/api/sample")
def api_sample():
    return jsonify(SAMPLE)


@app.post("/api/suggest")
def api_suggest():
    data = request.get_json(silent=True) or {}
    result = suggest_plans(
        data.get("sheet") or {},
        data.get("items") or [],
        allow_rotation=data.get("allowRotation", True),
        max_plans=int(data.get("maxPlans") or 6),
    )
    return jsonify(result)


def main():
    print("Thuật toán: cutting_stock.py  →  http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=True)


if __name__ == "__main__":
    main()
