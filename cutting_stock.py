"""
Cắt tấm carton 2 giai đoạn (guillotine) — SỬA HÀM Ở FILE NÀY.

Máy cắt hàng loạt:
  1) Cắt NGANG xuyên suốt tấm → các dải cùng chiều cao
  2) Cắt DỌC từng dải → từng tấm hộp

Trong một dải, mọi tấm phải cùng chiều cao (sau khi xoay 90° nếu được phép).
Nếu lệch hàng, nhát cắt ngang sẽ hư tấm.

Chạy web:  python app.py
Sửa xong hàm, Flask debug tự reload — F5 trình duyệt để xem plot.
"""

from __future__ import annotations

EPS = 1e-6

SAMPLE = {
    "sheet": {"width": 100, "height": 200},
    "items": [
        {"name": "A", "width": 10, "height": 20, "quantity": 10},
        {"name": "B", "width": 5, "height": 10, "quantity": 15},
        {"name": "C", "width": 2, "height": 3, "quantity": 20},
    ],
}


def fmt(n) -> str:
    if not isinstance(n, (int, float)) or n != n or n == float("inf"):
        return "—"
    r = round(n * 1000) / 1000
    if abs(r - round(r)) < 1e-9:
        return str(int(round(r)))
    return str(r)


def nearly(a, b) -> bool:
    return abs(a - b) < 1e-4


def is_positive_number(n) -> bool:
    return isinstance(n, (int, float)) and n == n and n > 0


def all_ints(sheet, items) -> bool:
    vals = [sheet["width"], sheet["height"]]
    for it in items:
        vals.extend([it["width"], it["height"]])
    return all(abs(v - round(v)) < 1e-9 for v in vals)


# ---------------------------------------------------------------------------
# Hướng xoay: chọn chiều nào làm CHIỀU CAO DẢI (cắt ngang)
# ---------------------------------------------------------------------------

def orientations_for(item, sheet_w, sheet_h, allow_rotation):
    """Các cách đặt 1 khổ lên dải: (stripH, pieceW, rotated)."""
    opts = []
    if item["height"] <= sheet_h + EPS and item["width"] <= sheet_w + EPS:
        opts.append({"rotated": False, "stripH": item["height"], "pieceW": item["width"]})
    if (
        allow_rotation
        and not nearly(item["width"], item["height"])
        and item["width"] <= sheet_h + EPS
        and item["height"] <= sheet_w + EPS
    ):
        opts.append({"rotated": True, "stripH": item["width"], "pieceW": item["height"]})
    return opts


# ---------------------------------------------------------------------------
# Xếp 1 dải (bài 1D): nhét các tấm cùng chiều cao vào khổ ngang tấm
# ---------------------------------------------------------------------------

def knapsack_greedy(capacity, types, wide_first=True):
    sorted_types = sorted(types, key=lambda t: t["width"], reverse=wide_first)
    left = capacity
    counts = {}
    for t in sorted_types:
        if t["width"] <= EPS:
            continue
        k = min(t["qty"], int((left + EPS) // t["width"]))
        if k > 0:
            counts[t["id"]] = counts.get(t["id"], 0) + k
            left -= k * t["width"]
    return {"used": capacity - left, "counts": counts}


def knapsack_dp(capacity, types):
    """Đầy dải nhất có thể (tối đa chiều rộng đã dùng)."""
    w_cap = round(capacity)
    work = [
        {**t, "width": round(t["width"]), "qty": max(0, int(t["qty"]))}
        for t in types
    ]
    ops = sum(t["qty"] for t in work) * (w_cap + 1)
    if w_cap > 900 or ops > 250_000:
        return knapsack_greedy(capacity, types, True)

    n = len(work)
    dp = [None] * (w_cap + 1)
    dp[0] = {"pieces": 0, "counts": [0] * n}

    for i, t in enumerate(work):
        width, qty = t["width"], t["qty"]
        if width <= 0 or qty <= 0:
            continue
        nxt = [None if s is None else {"pieces": s["pieces"], "counts": s["counts"][:]} for s in dp]
        for w in range(w_cap + 1):
            if dp[w] is None:
                continue
            max_k = min(qty, (w_cap - w) // width)
            for k in range(1, max_k + 1):
                nw = w + k * width
                pieces = dp[w]["pieces"] + k
                if nxt[nw] is None or pieces > nxt[nw]["pieces"]:
                    counts = dp[w]["counts"][:]
                    counts[i] += k
                    nxt[nw] = {"pieces": pieces, "counts": counts}
        dp = nxt

    best_w = 0
    for w in range(1, w_cap + 1):
        if dp[w] is not None and w >= best_w:
            best_w = w
    counts = {}
    if dp[best_w] is not None:
        for i, c in enumerate(dp[best_w]["counts"]):
            if c:
                counts[work[i]["id"]] = c
    return {"used": best_w, "counts": counts}


def fill_strip(capacity, types, integer_mode, fill_mode):
    usable = [t for t in types if t["qty"] > 0 and t["width"] <= capacity + EPS]
    if not usable:
        return {"used": 0, "counts": {}}
    if fill_mode == "narrow":
        return knapsack_greedy(capacity, usable, False)
    if fill_mode == "wide" or not integer_mode:
        return knapsack_greedy(capacity, usable, True)
    return knapsack_dp(capacity, usable)


def expand_pieces(counts, type_by_id, strip_h):
    pieces = []
    types = [type_by_id[i] for i in counts if i in type_by_id]
    types.sort(key=lambda t: t["width"], reverse=True)
    for t in types:
        k = counts.get(t["id"], 0)
        for _ in range(k):
            pieces.append(
                {
                    "key": t["key"],
                    "name": t["name"],
                    "width": t["width"],
                    "height": strip_h,
                    "rotated": t["rotated"],
                    "origW": t["origW"],
                    "origH": t["origH"],
                }
            )
    return pieces


# ---------------------------------------------------------------------------
# Tạo danh sách dải từ đơn hàng
#   homogeneous: mỗi hàng một khổ (cắt đồng loạt cùng size)
#   mixed:       trộn các khổ cùng chiều cao
#   backfill:    xếp cùng khổ trước, phần dư hàng mới trộn
# ---------------------------------------------------------------------------

def make_strips_homogeneous(sheet_w, assignment):
    strips = []
    for rec in assignment:
        item, orient = rec["item"], rec["orient"]
        if not orient or item["quantity"] <= 0:
            continue
        left = item["quantity"]
        per = int((sheet_w + EPS) // orient["pieceW"])
        if per <= 0:
            continue
        typ = {
            "id": item["key"],
            "key": item["key"],
            "name": item["name"],
            "width": orient["pieceW"],
            "qty": left,
            "rotated": orient["rotated"],
            "origW": item["width"],
            "origH": item["height"],
        }
        while left > 0:
            k = min(per, left)
            pieces = expand_pieces({typ["id"]: k}, {typ["id"]: {**typ, "qty": k}}, orient["stripH"])
            strips.append(
                {"height": orient["stripH"], "usedWidth": k * orient["pieceW"], "pieces": pieces}
            )
            left -= k
    return strips


def make_strips_mixed(sheet_w, assignment, integer_mode, fill_mode):
    groups = {}
    for rec in assignment:
        item, orient = rec["item"], rec["orient"]
        if not orient or item["quantity"] <= 0:
            continue
        groups.setdefault(orient["stripH"], []).append(
            {
                "id": item["key"],
                "key": item["key"],
                "name": item["name"],
                "width": orient["pieceW"],
                "qty": item["quantity"],
                "rotated": orient["rotated"],
                "origW": item["width"],
                "origH": item["height"],
            }
        )

    strips = []
    for strip_h, types in groups.items():
        remaining = [dict(t) for t in types]
        type_by_id = {t["id"]: t for t in remaining}
        while any(t["qty"] > 0 for t in remaining):
            fill = fill_strip(sheet_w, remaining, integer_mode, fill_mode)
            if not fill["used"] or not fill["counts"]:
                break
            placed = 0
            for tid, k in list(fill["counts"].items()):
                t = next((x for x in remaining if x["id"] == tid), None)
                if t is None:
                    continue
                use = min(k, t["qty"])
                if use <= 0:
                    del fill["counts"][tid]
                    continue
                fill["counts"][tid] = use
                t["qty"] -= use
                placed += use
            if not placed:
                break
            pieces = expand_pieces(fill["counts"], type_by_id, strip_h)
            if not pieces:
                break
            strips.append(
                {
                    "height": strip_h,
                    "usedWidth": sum(p["width"] for p in pieces),
                    "pieces": pieces,
                }
            )
    return strips


def make_strips_backfill(sheet_w, assignment, integer_mode):
    leftover = {}
    for rec in assignment:
        if not rec["orient"]:
            continue
        leftover[rec["item"]["key"]] = {
            "item": rec["item"],
            "orient": rec["orient"],
            "qty": rec["item"]["quantity"],
        }

    strips = []
    for rec in assignment:
        item, orient = rec["item"], rec["orient"]
        if not orient:
            continue
        rec_left = leftover.get(item["key"])
        if not rec_left or rec_left["qty"] <= 0:
            continue
        per = int((sheet_w + EPS) // orient["pieceW"])
        if per <= 0:
            continue
        while rec_left["qty"] > 0:
            k = min(per, rec_left["qty"])
            pieces = []
            for _ in range(k):
                pieces.append(
                    {
                        "key": item["key"],
                        "name": item["name"],
                        "width": orient["pieceW"],
                        "height": orient["stripH"],
                        "rotated": orient["rotated"],
                        "origW": item["width"],
                        "origH": item["height"],
                    }
                )
            rec_left["qty"] -= k
            used_w = k * orient["pieceW"]

            others = []
            for key, other in leftover.items():
                if key == item["key"] or other["qty"] <= 0 or not other["orient"]:
                    continue
                if not nearly(other["orient"]["stripH"], orient["stripH"]):
                    continue
                others.append(
                    {
                        "id": key,
                        "key": key,
                        "name": other["item"]["name"],
                        "width": other["orient"]["pieceW"],
                        "qty": other["qty"],
                        "rotated": other["orient"]["rotated"],
                        "origW": other["item"]["width"],
                        "origH": other["item"]["height"],
                    }
                )
            gap = sheet_w - used_w
            if others and gap > EPS:
                fill = fill_strip(gap, others, integer_mode, "dp")
                for tid, cnt in fill["counts"].items():
                    other = leftover.get(tid)
                    if not other:
                        continue
                    use = min(cnt, other["qty"])
                    for _ in range(use):
                        pieces.append(
                            {
                                "key": tid,
                                "name": other["item"]["name"],
                                "width": other["orient"]["pieceW"],
                                "height": orient["stripH"],
                                "rotated": other["orient"]["rotated"],
                                "origW": other["item"]["width"],
                                "origH": other["item"]["height"],
                            }
                        )
                        used_w += other["orient"]["pieceW"]
                    other["qty"] -= use
            strips.append({"height": orient["stripH"], "usedWidth": used_w, "pieces": pieces})
    return strips


# ---------------------------------------------------------------------------
# Xếp các dải vào tấm (1D bin packing theo chiều cao)
# ---------------------------------------------------------------------------

def layout_sheet(strips, sheet_w, sheet_h):
    y = 0
    laid = []
    for strip in strips:
        x = 0
        pieces = []
        for p in strip["pieces"]:
            pieces.append({**p, "x": x, "y": y})
            x += p["width"]
        laid.append(
            {
                "y": y,
                "height": strip["height"],
                "usedWidth": x,
                "scrapWidth": max(sheet_w - x, 0),
                "pieces": pieces,
            }
        )
        y += strip["height"]
    remnant_h = max(sheet_h - y, 0)
    return {
        "width": sheet_w,
        "height": sheet_h,
        "strips": laid,
        "usedHeight": y,
        "remnant": {"x": 0, "y": y, "width": sheet_w, "height": remnant_h},
    }


def pack_strips_into_sheets(strips, sheet_w, sheet_h, bin_mode):
    if any(s["height"] > sheet_h + EPS for s in strips):
        return {"sheets": [], "leftoverStrips": strips}

    ordered = list(strips) if bin_mode == "keep" else sorted(strips, key=lambda s: -s["height"])
    bins = []
    for strip in ordered:
        target = -1
        if bin_mode == "best":
            best_gap = float("inf")
            for i, bn in enumerate(bins):
                gap = sheet_h - bn["usedH"] - strip["height"]
                if gap >= -EPS and gap < best_gap:
                    best_gap = gap
                    target = i
        else:
            for i, bn in enumerate(bins):
                if bn["usedH"] + strip["height"] <= sheet_h + EPS:
                    target = i
                    break
        if target >= 0:
            bins[target]["strips"].append(strip)
            bins[target]["usedH"] += strip["height"]
        else:
            bins.append({"strips": [strip], "usedH": strip["height"]})
    sheets = [layout_sheet(bn["strips"], sheet_w, sheet_h) for bn in bins]
    return {"sheets": sheets, "leftoverStrips": []}


def count_packed(sheets):
    acc = {}
    for sheet in sheets:
        for strip in sheet["strips"]:
            for p in strip["pieces"]:
                rec = acc.setdefault(
                    p["key"],
                    {"name": p["name"], "width": p["origW"], "height": p["origH"], "quantity": 0},
                )
                rec["quantity"] += 1
    return acc


def build_cuts(sheets):
    out = []
    for si, sheet in enumerate(sheets, start=1):
        horizontal = []
        acc = 0
        for strip in sheet["strips"]:
            acc += strip["height"]
            if acc < sheet["height"] - EPS:
                horizontal.append(acc)
        vertical = []
        for ti, strip in enumerate(sheet["strips"], start=1):
            positions = []
            x = 0
            for p in strip["pieces"]:
                x += p["width"]
                if x < sheet["width"] - EPS:
                    positions.append(x)
            vertical.append(
                {"strip": ti, "y": strip["y"], "height": strip["height"], "positions": positions}
            )
        out.append({"sheet": si, "horizontal": horizontal, "vertical": vertical})
    return out


def metrics_of(sheets, items, sheet_w, sheet_h):
    demand_count = sum(it["quantity"] for it in items)
    packed_map = count_packed(sheets)
    packed_count = sum(r["quantity"] for r in packed_map.values())
    unpacked = []
    for it in items:
        got = packed_map.get(it["key"], {}).get("quantity", 0)
        if got < it["quantity"]:
            unpacked.append(
                {
                    "name": it["name"],
                    "width": it["width"],
                    "height": it["height"],
                    "quantity": it["quantity"] - got,
                }
            )
    sheet_count = len(sheets)
    strip_count = sum(len(sh["strips"]) for sh in sheets)
    sheet_area = sheet_count * sheet_w * sheet_h
    used_area = scrap_area = remnant_area = cut_count = 0
    remnants = []
    for sheet in sheets:
        for strip in sheet["strips"]:
            used_area += sum(p["width"] * p["height"] for p in strip["pieces"])
            scrap_area += strip["scrapWidth"] * strip["height"]
            if strip["pieces"]:
                extra = 0 if strip["scrapWidth"] > EPS else 1
                cut_count += max(len(strip["pieces"]) - extra, 0)
        remnant_area += sheet["remnant"]["height"] * sheet["remnant"]["width"]
        if sheet["remnant"]["height"] > EPS:
            remnants.append(f"{fmt(sheet['remnant']['width'])}×{fmt(sheet['remnant']['height'])}")
            cut_count += len(sheet["strips"])
        else:
            cut_count += max(len(sheet["strips"]) - 1, 0)
    waste_area = max(sheet_area - used_area, 0)
    return {
        "sheetCount": sheet_count,
        "stripCount": strip_count,
        "usedArea": used_area,
        "sheetArea": sheet_area,
        "wasteArea": waste_area,
        "wasteRatio": (waste_area / sheet_area) if sheet_area else 0,
        "scrapArea": scrap_area,
        "remnantArea": remnant_area,
        "remnantLabel": ", ".join(remnants) or "không còn dải nguyên",
        "cutCount": cut_count,
        "packedCount": packed_count,
        "demandCount": demand_count,
        "unpacked": unpacked,
    }


def layout_hash(sheets) -> str:
    parts = []
    for sheet in sheets:
        body = "/".join(
            f"{fmt(st['height'])}@{fmt(st['y'])}:"
            + ",".join(f"{p['key']}:{fmt(p['width'])}x{fmt(p['height'])}" for p in st["pieces"])
            for st in sheet["strips"]
        )
        parts.append(f"{sheet['width']}x{sheet['height']}|{body}")
    return "||".join(parts)


def score_plan(plan):
    m = plan["metrics"]
    unpacked_qty = sum(u["quantity"] for u in m["unpacked"])
    return (
        unpacked_qty,
        m["sheetCount"],
        m["scrapArea"],
        m["stripCount"],
        m["cutCount"],
        m["wasteArea"],
    )


def better_score(a, b) -> bool:
    return a < b


def describe(assignment, mix, swapped, sheet_w, sheet_h):
    sheet_txt = (
        f"Xoay tấm nguyên thành {fmt(sheet_w)}×{fmt(sheet_h)} rồi cắt ngang theo cạnh {fmt(sheet_w)}"
        if swapped
        else f"Tấm {fmt(sheet_w)}×{fmt(sheet_h)}, cắt ngang trước rồi cắt dọc"
    )
    if mix is True:
        mix_txt = "Trộn các khổ cùng chiều dài trong một hàng"
    elif mix == "backfill":
        mix_txt = "Xếp cùng khổ trước, phần dư hàng mới trộn"
    else:
        mix_txt = "Mỗi hàng chỉ một khổ — cắt đồng loạt cùng size"
    rows = []
    for rec in assignment:
        if not rec["orient"]:
            continue
        rot = " (xoay 90°)" if rec["orient"]["rotated"] else ""
        rows.append(f"{rec['item']['name']} → hàng dài {fmt(rec['orient']['stripH'])}{rot}")
    return {"sheetTxt": sheet_txt, "mixTxt": mix_txt, "rows": rows}


def candidate_from(items, sheet_w, sheet_h, assignment, mix, swapped, integer_mode, fill_mode, bin_mode):
    if mix is True:
        strips = make_strips_mixed(sheet_w, assignment, integer_mode, fill_mode)
    elif mix == "backfill":
        strips = make_strips_backfill(sheet_w, assignment, integer_mode)
    else:
        strips = make_strips_homogeneous(sheet_w, assignment)
    if not strips:
        return None
    packed = pack_strips_into_sheets(strips, sheet_w, sheet_h, bin_mode)
    if not packed["sheets"]:
        return None
    metrics = metrics_of(packed["sheets"], items, sheet_w, sheet_h)
    return {
        "sheets": packed["sheets"],
        "metrics": metrics,
        "swapped": swapped,
        "sheetWidth": sheet_w,
        "sheetHeight": sheet_h,
        "mix": mix,
        "desc": describe(assignment, mix, swapped, sheet_w, sheet_h),
        "cuts": build_cuts(packed["sheets"]),
        "hash": layout_hash(packed["sheets"]),
    }


def each_assignment(items, sheet_w, sheet_h, allow_rotation, visit):
    choices = []
    for item in items:
        opts = orientations_for(item, sheet_w, sheet_h, allow_rotation)
        choices.append(opts if opts else [None])
    product = 1
    for c in choices:
        product *= len(c)

    if product > 24:
        for h in ("first", "tall", "wide", "fill"):
            assignment = []
            for i, item in enumerate(items):
                opts = [o for o in choices[i] if o]
                orient = opts[0] if opts else None
                if h == "tall" and opts:
                    orient = max(opts, key=lambda o: o["stripH"])
                elif h == "wide" and opts:
                    orient = max(opts, key=lambda o: o["pieceW"])
                elif h == "fill" and opts:

                    def fill_key(o):
                        fill = int((sheet_w + EPS) // o["pieceW"]) * o["pieceW"]
                        per = max(1, int((sheet_w + EPS) // o["pieceW"]))
                        strips = -(-item["quantity"] // per)
                        return (-fill, strips)

                    orient = min(opts, key=fill_key)
                assignment.append({"item": item, "orient": orient})
            visit(assignment)
        return

    acc = []

    def rec(i):
        if i == len(items):
            visit([{"item": a["item"], "orient": a["orient"]} for a in acc])
            return
        for orient in choices[i]:
            acc.append({"item": items[i], "orient": orient})
            rec(i + 1)
            acc.pop()

    rec(0)


def normalize(sheet_input, items_input):
    errors = []
    try:
        width = float(sheet_input.get("width"))
        height = float(sheet_input.get("height"))
    except (TypeError, ValueError):
        width = height = 0
    if not is_positive_number(width) or not is_positive_number(height):
        errors.append("Khổ tấm phải là số dương.")
    cleaned = []
    for i, raw in enumerate(items_input or []):
        try:
            w = float(raw.get("width"))
            h = float(raw.get("height"))
            q = float(raw.get("quantity"))
        except (TypeError, ValueError):
            errors.append(f"Dòng {i + 1}: rộng/dài/SL phải là số.")
            continue
        if not is_positive_number(w) or not is_positive_number(h):
            errors.append(f"Dòng {i + 1}: rộng/dài phải là số dương.")
            continue
        if not is_positive_number(q) or abs(q - round(q)) > 1e-9:
            errors.append(f"Dòng {i + 1}: số lượng phải là số nguyên dương.")
            continue
        q = int(round(q))
        name = str(raw.get("name") or "").strip() or f"{fmt(w)}×{fmt(h)}"
        cleaned.append({"name": name, "width": w, "height": h, "quantity": q, "key": f"{name}::{w}x{h}"})
    if not cleaned:
        errors.append("Cần ít nhất một khổ cần cắt.")
    return errors, {"width": width, "height": height}, cleaned


def mix_label(mix) -> str:
    if mix is True:
        return "trộn hàng"
    if mix == "backfill":
        return "dư hàng trộn"
    return "tách khổ"


def suggest_plans(sheet_input, items_input, allow_rotation=True, max_plans=6):
    """
    Điểm vào chính: trả về vài cách cắt, cách đầu tiên là tối ưu nhất
    (ít tấm chưa xếp → ít tờ → ít rác trong hàng → ít hàng cắt).
    """
    errors, sheet, items = normalize(sheet_input, items_input)
    if errors:
        return {"ok": False, "errors": errors, "plans": []}

    integer_mode = all_ints(sheet, items)
    candidates = []
    sheet_opts = [
        {"width": sheet["width"], "height": sheet["height"], "swapped": False},
        {"width": sheet["height"], "height": sheet["width"], "swapped": True},
    ]
    mix_modes = [False, True, "backfill"]
    fill_modes_mixed = ["dp", "wide"] if integer_mode else ["wide", "narrow"]
    bin_modes = ["keep", "first"]

    def visit(assignment, sh):
        if all(a["orient"] is None for a in assignment):
            return
        for mix in mix_modes:
            fills = fill_modes_mixed if mix is True else ["dp"]
            for fill_mode in fills:
                for bin_mode in bin_modes:
                    cand = candidate_from(
                        items,
                        sh["width"],
                        sh["height"],
                        assignment,
                        mix,
                        sh["swapped"],
                        integer_mode,
                        fill_mode,
                        bin_mode,
                    )
                    if cand:
                        candidates.append(cand)

    for sh in sheet_opts:
        each_assignment(
            items,
            sh["width"],
            sh["height"],
            allow_rotation,
            lambda assignment, sh=sh: visit(assignment, sh),
        )

    best_by_hash = {}
    for cand in candidates:
        prev = best_by_hash.get(cand["hash"])
        if prev is None or better_score(score_plan(cand), score_plan(prev)):
            best_by_hash[cand["hash"]] = cand

    unique = sorted(best_by_hash.values(), key=score_plan)
    plans = []
    for i, cand in enumerate(unique[:max_plans]):
        bits = [mix_label(cand["mix"])]
        if cand["swapped"]:
            bits.append("xoay tấm")
        plans.append(
            {
                "id": f"plan-{i + 1}",
                "title": f"Cách {i + 1}",
                "best": i == 0,
                "label": " · ".join(bits),
                "sheetWidth": cand["sheetWidth"],
                "sheetHeight": cand["sheetHeight"],
                "swapped": cand["swapped"],
                "mix": cand["mix"],
                "desc": cand["desc"],
                "sheets": cand["sheets"],
                "cuts": cand["cuts"],
                "metrics": cand["metrics"],
            }
        )

    if not plans:
        return {
            "ok": True,
            "errors": [],
            "plans": [],
            "demand": items,
            "sheet": sheet,
            "message": "Không xếp được khổ nào vào tấm (kể cả khi xoay). Tăng khổ tấm hoặc giảm khổ cần cắt.",
        }
    return {"ok": True, "errors": [], "plans": plans, "demand": items, "sheet": sheet}


def assert_valid_plan(plan):
    problems = []
    for si, sheet in enumerate(plan["sheets"]):
        for strip in sheet["strips"]:
            if strip["y"] + strip["height"] > sheet["height"] + EPS:
                problems.append(f"Sheet {si}: strip vượt chiều cao tấm")
            x = 0
            for p in strip["pieces"]:
                if not nearly(p["height"], strip["height"]):
                    problems.append(f"Sheet {si}: tấm {p['name']} lệch chiều cao dải")
                if not nearly(p["y"], strip["y"]) or not nearly(p["x"], x):
                    problems.append(f"Sheet {si}: tấm {p['name']} không thẳng hàng")
                if p["x"] + p["width"] > sheet["width"] + EPS:
                    problems.append(f"Sheet {si}: tấm {p['name']} tràn mép")
                x += p["width"]
    return problems
