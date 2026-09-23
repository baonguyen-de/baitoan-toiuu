"""
Cắt tấm carton 2 giai đoạn (guillotine) — SỬA HÀM Ở FILE NÀY.

Máy cắt hàng loạt:
  1) Xén biên máy (Trim) — trừ trước, không phải dư sau xếp
  2) Cắt NGANG xuyên suốt khổ hữu dụng → các dải cùng chiều cao
  3) Cắt DỌC từng dải → từng tấm hộp

Trong một dải, mọi tấm phải cùng chiều cao (sau khi xoay 90° nếu được phép).
Nếu lệch hàng, nhát cắt ngang sẽ hư tấm.

Chạy web:  python app.py
Sửa xong hàm, Flask debug tự reload — F5 trình duyệt để xem plot.
"""

from __future__ import annotations

EPS = 1e-6

SAMPLE = {
    "sheet": {"width": 100, "height": 200},
    "trim": {"left": 0, "right": 0, "top": 0, "bottom": 0},
    "items": [
        {"name": "A", "width": 10, "height": 20, "quantity": 10},
        {"name": "B", "width": 5, "height": 10, "quantity": 15},
        {"name": "C", "width": 2, "height": 3, "quantity": 20},
    ],
}

ZERO_TRIM = {"left": 0.0, "right": 0.0, "top": 0.0, "bottom": 0.0}


def fmt(n) -> str:
    if not isinstance(n, (int, float)) or n != n or n == float("inf"):
        return "—"
    r = round(n * 1000) / 1000
    if abs(r - round(r)) < 1e-9:
        return str(int(round(r)))
    return str(r)


def nearly(a, b) -> bool:
    return abs(a - b) < 1e-4


def nearly_area(a, b, sheet_area=1.0) -> bool:
    tol = max(1e-4, 1e-8 * max(abs(sheet_area), 1.0))
    return abs(a - b) <= tol


def is_positive_number(n) -> bool:
    return isinstance(n, (int, float)) and n == n and n > 0


def is_nonneg_number(n) -> bool:
    return isinstance(n, (int, float)) and n == n and n >= 0


def default_trim():
    return dict(ZERO_TRIM)


def all_ints(sheet, items, trim=None) -> bool:
    vals = [sheet["width"], sheet["height"]]
    for it in items:
        vals.extend([it["width"], it["height"]])
    if trim:
        vals.extend([trim["left"], trim["right"], trim["top"], trim["bottom"]])
    return all(abs(v - round(v)) < 1e-9 for v in vals)


def usable_size(sheet_w, sheet_h, trim):
    return (
        sheet_w - trim["left"] - trim["right"],
        sheet_h - trim["top"] - trim["bottom"],
    )


def trim_area_of(sheet_w, sheet_h, trim) -> float:
    uw, uh = usable_size(sheet_w, sheet_h, trim)
    return max(sheet_w * sheet_h - max(uw, 0) * max(uh, 0), 0)


def make_trim_zones(w, h, trim):
    """Vùng biên máy trên tờ nguyên (toạ độ vật lý, không xoay nhãn)."""
    L, R, T, B = trim["left"], trim["right"], trim["top"], trim["bottom"]
    zones = []
    if L > EPS:
        zones.append({"side": "left", "x": 0, "y": 0, "width": L, "height": h, "label": f"TRIM {fmt(L)}"})
    if R > EPS:
        zones.append({"side": "right", "x": w - R, "y": 0, "width": R, "height": h, "label": f"TRIM {fmt(R)}"})
    mid_w = max(w - L - R, 0)
    if T > EPS and mid_w > EPS:
        zones.append({"side": "top", "x": L, "y": 0, "width": mid_w, "height": T, "label": f"TRIM {fmt(T)}"})
    if B > EPS and mid_w > EPS:
        zones.append({"side": "bottom", "x": L, "y": h - B, "width": mid_w, "height": B, "label": f"TRIM {fmt(B)}"})
    return zones


def remap_trim_ccw(trim):
    """Tờ xoay 90° CCW lên bàn cắt: cạnh vật lý tờ đi theo, trim máy bám mép tờ."""
    return {
        "left": trim["top"],
        "right": trim["bottom"],
        "top": trim["right"],
        "bottom": trim["left"],
    }


def rotate_rect_cw(x, y, w, h, pack_w):
    """Hoàn tác xoay tờ 90° CCW: đưa rect từ khung packing về tờ vật lý."""
    return {
        "x": y,
        "y": pack_w - x - w,
        "width": h,
        "height": w,
    }


# ---------------------------------------------------------------------------
# Hướng xoay: chọn chiều nào làm CHIỀU CAO DẢI (cắt ngang)
# ---------------------------------------------------------------------------

def orientations_for(item, sheet_w, sheet_h, allow_rotation):
    """Các cách đặt 1 khổ lên dải: (stripH, pieceW, rotated). Khổ so với khổ hữu dụng."""
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
# Xếp 1 dải (bài 1D): nhét các tấm cùng chiều cao vào khổ ngang hữu dụng
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
    # Trần cũ 900 quá thấp cho khổ mm (vd. hữu dụng 2150). Giới hạn theo số thao tác.
    if w_cap > 20_000 or ops > 250_000:
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
# Xếp các dải vào khổ hữu dụng (1D bin packing theo chiều cao)
# ---------------------------------------------------------------------------

def layout_sheet(strips, pack_opt):
    ox, oy = pack_opt["ox"], pack_opt["oy"]
    uw, uh = pack_opt["usable_w"], pack_opt["usable_h"]
    fw, fh = pack_opt["pack_w"], pack_opt["pack_h"]
    trim = pack_opt["trim"]
    y = oy
    laid = []
    for strip in strips:
        x = ox
        pieces = []
        for p in strip["pieces"]:
            pieces.append({**p, "x": x, "y": y})
            x += p["width"]
        used_w = x - ox
        scrap_w = max(uw - used_w, 0)
        laid.append(
            {
                "orientation": "h",
                "y": y,
                "x": ox,
                "height": strip["height"],
                "usedWidth": used_w,
                "scrapWidth": scrap_w,
                "scrapRect": {"x": ox + used_w, "y": y, "width": scrap_w, "height": strip["height"]},
                "pieces": pieces,
            }
        )
        y += strip["height"]
    used_h = y - oy
    remnant_h = max(uh - used_h, 0)
    remnant = {"x": ox, "y": y, "width": uw, "height": remnant_h}
    return {
        "width": fw,
        "height": fh,
        "strips": laid,
        "usedHeight": oy + used_h,
        "remnant": remnant,
        "trim": dict(trim),
        "trimZones": make_trim_zones(fw, fh, trim),
        "usableRect": {"x": ox, "y": oy, "width": uw, "height": uh},
        "origSheetWidth": pack_opt["orig_w"],
        "origSheetHeight": pack_opt["orig_h"],
        "swapped": pack_opt["swapped"],
    }


def transform_sheet_to_original(sheet, orig_w, orig_h, orig_trim):
    """Đưa layout từ khung packing (tờ đã xoay) về tờ vật lý orig_w × orig_h."""
    pack_w = sheet["width"]

    def tr(rect):
        return rotate_rect_cw(rect["x"], rect["y"], rect["width"], rect["height"], pack_w)

    new_strips = []
    for strip in sheet["strips"]:
        new_pieces = []
        for p in strip["pieces"]:
            nr = tr({"x": p["x"], "y": p["y"], "width": p["width"], "height": p["height"]})
            new_pieces.append({**p, **nr})
        new_pieces.sort(key=lambda p: (round(p["x"], 9), round(p["y"], 9)))
        sr = tr(strip["scrapRect"]) if strip.get("scrapRect") else None
        xs = [p["x"] for p in new_pieces]
        ys = [p["y"] for p in new_pieces]
        new_strips.append(
            {
                "orientation": "v",
                "x": min(xs) if xs else strip["y"],
                "y": min(ys) if ys else 0,
                "height": strip["height"],
                "usedWidth": strip["usedWidth"],
                "scrapWidth": strip["scrapWidth"],
                "scrapRect": sr,
                "pieces": new_pieces,
            }
        )
    rem = tr(sheet["remnant"])
    bottoms = [p["y"] + p["height"] for st in new_strips for p in st["pieces"]]
    if rem["height"] > EPS:
        bottoms.append(rem["y"] + rem["height"])
    for p in new_strips:
        sr = p.get("scrapRect")
        if sr and sr["height"] > EPS:
            bottoms.append(sr["y"] + sr["height"])
    uw, uh = usable_size(orig_w, orig_h, orig_trim)
    return {
        "width": orig_w,
        "height": orig_h,
        "strips": new_strips,
        "usedHeight": max(bottoms) if bottoms else orig_trim["top"] + uh,
        "remnant": rem,
        "trim": dict(orig_trim),
        "trimZones": make_trim_zones(orig_w, orig_h, orig_trim),
        "usableRect": {
            "x": orig_trim["left"],
            "y": orig_trim["top"],
            "width": uw,
            "height": uh,
        },
        "origSheetWidth": orig_w,
        "origSheetHeight": orig_h,
        "swapped": True,
    }


def pack_strips_into_sheets(strips, pack_opt, bin_mode):
    usable_h = pack_opt["usable_h"]
    if any(s["height"] > usable_h + EPS for s in strips):
        return {"sheets": [], "leftoverStrips": strips}

    ordered = list(strips) if bin_mode == "keep" else sorted(strips, key=lambda s: -s["height"])
    bins = []
    for strip in ordered:
        target = -1
        if bin_mode == "best":
            best_gap = float("inf")
            for i, bn in enumerate(bins):
                gap = usable_h - bn["usedH"] - strip["height"]
                if gap >= -EPS and gap < best_gap:
                    best_gap = gap
                    target = i
        else:
            for i, bn in enumerate(bins):
                if bn["usedH"] + strip["height"] <= usable_h + EPS:
                    target = i
                    break
        if target >= 0:
            bins[target]["strips"].append(strip)
            bins[target]["usedH"] += strip["height"]
        else:
            bins.append({"strips": [strip], "usedH": strip["height"]})
    sheets = [layout_sheet(bn["strips"], pack_opt) for bn in bins]
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


def scrap_area_of(strip) -> float:
    sr = strip.get("scrapRect")
    if sr:
        return max(sr.get("width", 0), 0) * max(sr.get("height", 0), 0)
    return max(strip.get("scrapWidth", 0), 0) * max(strip.get("height", 0), 0)


def remnant_area_of(sheet) -> float:
    r = sheet.get("remnant") or {}
    return max(r.get("width", 0), 0) * max(r.get("height", 0), 0)


def cut_count_of(sheets) -> int:
    """Đếm nhát trên khung packing (hàng ngang). Gọi trước khi xoay về tờ vật lý."""
    cut_count = 0
    for sheet in sheets:
        for strip in sheet["strips"]:
            if strip["pieces"]:
                extra = 0 if strip["scrapWidth"] > EPS else 1
                cut_count += max(len(strip["pieces"]) - extra, 0)
        if sheet["remnant"]["height"] > EPS:
            cut_count += len(sheet["strips"])
        else:
            cut_count += max(len(sheet["strips"]) - 1, 0)
    return cut_count


def build_cuts(sheets):
    out = []
    for si, sheet in enumerate(sheets, start=1):
        usable = sheet.get("usableRect") or {
            "x": 0,
            "y": 0,
            "width": sheet["width"],
            "height": sheet["height"],
        }
        ux, uy, uw, uh = usable["x"], usable["y"], usable["width"], usable["height"]
        horizontal = []
        vertical = []
        for ti, strip in enumerate(sheet["strips"], start=1):
            ori = strip.get("orientation", "h")
            positions = []
            if ori == "v":
                for p in strip["pieces"]:
                    ye = p["y"] + p["height"]
                    if ye < uy + uh - EPS:
                        horizontal.append(ye)
                if strip["pieces"]:
                    xb = strip["pieces"][0]["x"] + strip["pieces"][0]["width"]
                    if xb < ux + uw - EPS:
                        positions.append(xb)
                vertical.append(
                    {
                        "strip": ti,
                        "y": strip.get("y", 0),
                        "height": strip.get("height", 0),
                        "x": strip.get("x", 0),
                        "orientation": "v",
                        "positions": positions,
                    }
                )
            else:
                yb = strip["y"] + strip["height"]
                if yb < uy + uh - EPS:
                    horizontal.append(yb)
                for p in strip["pieces"]:
                    x = p["x"] + p["width"]
                    if x < ux + uw - EPS:
                        positions.append(x)
                vertical.append(
                    {
                        "strip": ti,
                        "y": strip["y"],
                        "height": strip["height"],
                        "x": strip.get("x", ux),
                        "orientation": "h",
                        "positions": positions,
                    }
                )
        out.append(
            {
                "sheet": si,
                "horizontal": horizontal,
                "vertical": vertical,
                "trim": dict(sheet.get("trim") or ZERO_TRIM),
                "swapped": bool(sheet.get("swapped")),
            }
        )
    return out


def metrics_of(sheets, items, orig_w, orig_h, trim, cut_count=None):
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
    sheet_area = sheet_count * orig_w * orig_h
    uw, uh = usable_size(orig_w, orig_h, trim)
    usable_area = sheet_count * max(uw, 0) * max(uh, 0)
    trim_area = sheet_count * trim_area_of(orig_w, orig_h, trim)
    used_area = scrap_area = remnant_area = 0
    remnants = []
    for sheet in sheets:
        for strip in sheet["strips"]:
            used_area += sum(p["width"] * p["height"] for p in strip["pieces"])
            scrap_area += scrap_area_of(strip)
        remnant_area += remnant_area_of(sheet)
        rem = sheet["remnant"]
        if rem["width"] > EPS and rem["height"] > EPS:
            remnants.append(f"{fmt(rem['width'])}×{fmt(rem['height'])}")
    if cut_count is None:
        cut_count = cut_count_of(sheets)
    waste_area = max(sheet_area - used_area, 0)
    utilization = (used_area / sheet_area) if sheet_area else 0
    waste_ratio = (waste_area / sheet_area) if sheet_area else 0
    return {
        "sheetCount": sheet_count,
        "stripCount": strip_count,
        "usedArea": used_area,
        "packedArea": used_area,
        "sheetArea": sheet_area,
        "wasteArea": waste_area,
        "wasteRatio": waste_ratio,
        "utilization": utilization,
        "scrapArea": scrap_area,
        "remnantArea": remnant_area,
        "trimArea": trim_area,
        "usableArea": usable_area,
        "usableWidth": uw,
        "usableHeight": uh,
        "trim": dict(trim),
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
            f"{fmt(st['height'])}@{fmt(st.get('x', 0))},{fmt(st['y'])}:"
            + ",".join(f"{p['key']}:{fmt(p['width'])}x{fmt(p['height'])}@{fmt(p['x'])},{fmt(p['y'])}" for p in st["pieces"])
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
        m["wasteRatio"],
        m["scrapArea"],
        -m["remnantArea"],
        m["stripCount"],
        m["cutCount"],
    )


def better_score(a, b) -> bool:
    return a < b


def describe(assignment, mix, swapped, orig_w, orig_h):
    sheet_txt = (
        "Xoay Tấm nguyên BTP"
        if swapped
        else f"Tấm {fmt(orig_w)}×{fmt(orig_h)}, cắt ngang trước rồi cắt dọc"
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


def packing_options(orig_w, orig_h, trim, allow_sheet_rotation):
    uw, uh = usable_size(orig_w, orig_h, trim)
    opts = [
        {
            "orig_w": orig_w,
            "orig_h": orig_h,
            "pack_w": orig_w,
            "pack_h": orig_h,
            "trim": dict(trim),
            "orig_trim": dict(trim),
            "usable_w": uw,
            "usable_h": uh,
            "ox": trim["left"],
            "oy": trim["top"],
            "swapped": False,
        }
    ]
    if allow_sheet_rotation and not nearly(orig_w, orig_h):
        t = remap_trim_ccw(trim)
        puw, puh = usable_size(orig_h, orig_w, t)
        opts.append(
            {
                "orig_w": orig_w,
                "orig_h": orig_h,
                "pack_w": orig_h,
                "pack_h": orig_w,
                "trim": t,
                "orig_trim": dict(trim),
                "usable_w": puw,
                "usable_h": puh,
                "ox": t["left"],
                "oy": t["top"],
                "swapped": True,
            }
        )
    return opts


def candidate_from(items, assignment, mix, integer_mode, fill_mode, bin_mode, pack_opt):
    uw = pack_opt["usable_w"]
    uh = pack_opt["usable_h"]
    orig_w, orig_h = pack_opt["orig_w"], pack_opt["orig_h"]
    orig_trim = pack_opt["orig_trim"]
    swapped = pack_opt["swapped"]
    if mix is True:
        strips = make_strips_mixed(uw, assignment, integer_mode, fill_mode)
    elif mix == "backfill":
        strips = make_strips_backfill(uw, assignment, integer_mode)
    else:
        strips = make_strips_homogeneous(uw, assignment)
    if not strips:
        return None
    packed = pack_strips_into_sheets(strips, pack_opt, bin_mode)
    if not packed["sheets"]:
        return None
    cuts_count = cut_count_of(packed["sheets"])
    sheets = packed["sheets"]
    if swapped:
        sheets = [transform_sheet_to_original(sh, orig_w, orig_h, orig_trim) for sh in sheets]
    metrics = metrics_of(sheets, items, orig_w, orig_h, orig_trim, cut_count=cuts_count)
    return {
        "sheets": sheets,
        "metrics": metrics,
        "swapped": swapped,
        "sheetWidth": orig_w,
        "sheetHeight": orig_h,
        "origSheetWidth": orig_w,
        "origSheetHeight": orig_h,
        "mix": mix,
        "desc": describe(assignment, mix, swapped, orig_w, orig_h),
        "cuts": build_cuts(sheets),
        "hash": layout_hash(sheets),
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

                    def fill_key(o, item=item):
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


def normalize_trim(trim_input):
    errors = []
    raw = trim_input or {}
    out = {}
    for key in ("left", "right", "top", "bottom"):
        val = raw.get(key, 0)
        if val is None or val == "":
            val = 0
        try:
            val = float(val)
        except (TypeError, ValueError):
            errors.append(f"Trim {key} phải là số ≥ 0.")
            out[key] = 0.0
            continue
        if not is_nonneg_number(val):
            errors.append(f"Trim {key} phải là số ≥ 0.")
            out[key] = 0.0
            continue
        out[key] = val
    return errors, out


def normalize(sheet_input, items_input, trim_input=None):
    errors = []
    try:
        width = float(sheet_input.get("width"))
        height = float(sheet_input.get("height"))
    except (TypeError, ValueError):
        width = height = 0
    if not is_positive_number(width) or not is_positive_number(height):
        errors.append("Khổ tấm phải là số dương.")
    trim_errors, trim = normalize_trim(trim_input)
    errors.extend(trim_errors)
    uw, uh = usable_size(width, height, trim) if width and height else (0, 0)
    if is_positive_number(width) and is_positive_number(height) and (uw <= EPS or uh <= EPS):
        errors.append("Khổ hữu dụng sau khi trừ trim phải là số dương (trim đang lớn hơn tấm nguyên).")
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
    sheet = {
        "width": width,
        "height": height,
        "trim": trim,
        "usableWidth": uw,
        "usableHeight": uh,
    }
    return errors, sheet, cleaned


def mix_label(mix) -> str:
    if mix is True:
        return "trộn hàng"
    if mix == "backfill":
        return "dư hàng trộn"
    return "tách khổ"


def suggest_plans(
    sheet_input,
    items_input,
    allow_rotation=True,
    max_plans=6,
    trim_input=None,
    allow_piece_rotation=None,
    allow_sheet_rotation=False,
):
    """
    Điểm vào chính: trả về vài cách cắt, cách đầu tiên là tối ưu nhất.

    allow_rotation (cũ) map sang allow_piece_rotation — xoay từng BTP 90°.
    allow_sheet_rotation mặc định False: không đổi cạnh cắt ngang tờ nguyên.
    """
    if allow_piece_rotation is None:
        allow_piece_rotation = allow_rotation
    if trim_input is None and isinstance(sheet_input, dict):
        trim_input = sheet_input.get("trim")

    errors, sheet, items = normalize(sheet_input, items_input, trim_input)
    if errors:
        return {"ok": False, "errors": errors, "plans": []}

    orig_w, orig_h = sheet["width"], sheet["height"]
    trim = sheet["trim"]
    integer_mode = all_ints(sheet, items, trim)
    candidates = []
    pack_opts = packing_options(orig_w, orig_h, trim, bool(allow_sheet_rotation))
    mix_modes = [False, True, "backfill"]
    fill_modes_mixed = ["dp", "wide"] if integer_mode else ["wide", "narrow"]
    bin_modes = ["keep", "first"]

    def visit(assignment, pack_opt):
        if all(a["orient"] is None for a in assignment):
            return
        for mix in mix_modes:
            fills = fill_modes_mixed if mix is True else ["dp"]
            for fill_mode in fills:
                for bin_mode in bin_modes:
                    cand = candidate_from(
                        items,
                        assignment,
                        mix,
                        integer_mode,
                        fill_mode,
                        bin_mode,
                        pack_opt,
                    )
                    if cand:
                        candidates.append(cand)

    for pack_opt in pack_opts:
        each_assignment(
            items,
            pack_opt["usable_w"],
            pack_opt["usable_h"],
            allow_piece_rotation,
            lambda assignment, pack_opt=pack_opt: visit(assignment, pack_opt),
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
            bits.append("xoay Tấm nguyên BTP")
        plans.append(
            {
                "id": f"plan-{i + 1}",
                "title": f"Cách {i + 1}",
                "best": i == 0,
                "label": " · ".join(bits),
                "sheetWidth": cand["sheetWidth"],
                "sheetHeight": cand["sheetHeight"],
                "origSheetWidth": cand["origSheetWidth"],
                "origSheetHeight": cand["origSheetHeight"],
                "swapped": cand["swapped"],
                "mix": cand["mix"],
                "desc": cand["desc"],
                "sheets": cand["sheets"],
                "cuts": cand["cuts"],
                "metrics": cand["metrics"],
            }
        )

    payload = {
        "ok": True,
        "errors": [],
        "plans": plans,
        "demand": items,
        "sheet": sheet,
        "trim": trim,
        "allowPieceRotation": bool(allow_piece_rotation),
        "allowSheetRotation": bool(allow_sheet_rotation),
    }
    if not plans:
        payload["message"] = (
            "Không xếp được khổ nào vào khổ hữu dụng (kể cả khi xoay). "
            "Tăng khổ tấm, giảm trim, hoặc giảm khổ cần cắt."
        )
        return payload
    return payload


def piece_in_usable(p, usable) -> bool:
    return (
        p["x"] >= usable["x"] - EPS
        and p["y"] >= usable["y"] - EPS
        and p["x"] + p["width"] <= usable["x"] + usable["width"] + EPS
        and p["y"] + p["height"] <= usable["y"] + usable["height"] + EPS
    )


def rects_overlap(a, b) -> bool:
    return (
        a["x"] < b["x"] + b["width"] - EPS
        and a["x"] + a["width"] > b["x"] + EPS
        and a["y"] < b["y"] + b["height"] - EPS
        and a["y"] + a["height"] > b["y"] + EPS
    )


def assert_valid_plan(plan):
    problems = []
    orig_w = plan.get("origSheetWidth") or plan.get("sheetWidth")
    orig_h = plan.get("origSheetHeight") or plan.get("sheetHeight")
    metrics_trim = (plan.get("metrics") or {}).get("trim") or ZERO_TRIM
    for si, sheet in enumerate(plan["sheets"]):
        if orig_w is not None and not nearly(sheet["width"], orig_w):
            problems.append(f"Sheet {si}: width không khớp tờ nguyên (không được đổi nhãn Rộng/Dài)")
        if orig_h is not None and not nearly(sheet["height"], orig_h):
            problems.append(f"Sheet {si}: height không khớp tờ nguyên (không được đổi nhãn Rộng/Dài)")
        trim = sheet.get("trim") or metrics_trim
        usable = sheet.get("usableRect") or {
            "x": trim["left"],
            "y": trim["top"],
            "width": sheet["width"] - trim["left"] - trim["right"],
            "height": sheet["height"] - trim["top"] - trim["bottom"],
        }
        packed = scrap = 0
        for strip in sheet["strips"]:
            if strip.get("y", 0) + (strip["height"] if strip.get("orientation", "h") == "h" else 0) > sheet["height"] + EPS and strip.get("orientation", "h") == "h":
                problems.append(f"Sheet {si}: strip vượt chiều cao tấm")
            ori = strip.get("orientation", "h")
            scrap += scrap_area_of(strip)
            if ori == "v":
                y = None
                x0 = None
                w0 = None
                for p in strip["pieces"]:
                    packed += p["width"] * p["height"]
                    if not piece_in_usable(p, usable):
                        problems.append(f"Sheet {si}: tấm {p['name']} đè trim / ra ngoài khổ hữu dụng")
                    if x0 is None:
                        x0, w0, y = p["x"], p["width"], p["y"]
                    if not nearly(p["x"], x0) or not nearly(p["width"], w0):
                        problems.append(f"Sheet {si}: tấm {p['name']} lệch dải dọc")
                    if y is not None and not nearly(p["y"], y):
                        problems.append(f"Sheet {si}: tấm {p['name']} không thẳng hàng dọc")
                    y = p["y"] + p["height"]
                    for zone in sheet.get("trimZones") or []:
                        if rects_overlap(p, zone):
                            problems.append(f"Sheet {si}: tấm {p['name']} đè vùng trim")
            else:
                x = usable["x"]
                for p in strip["pieces"]:
                    packed += p["width"] * p["height"]
                    if not nearly(p["height"], strip["height"]):
                        problems.append(f"Sheet {si}: tấm {p['name']} lệch chiều cao dải")
                    if not nearly(p["y"], strip["y"]) or not nearly(p["x"], x):
                        problems.append(f"Sheet {si}: tấm {p['name']} không thẳng hàng")
                    if not piece_in_usable(p, usable):
                        problems.append(f"Sheet {si}: tấm {p['name']} đè trim / ra ngoài khổ hữu dụng")
                    if p["x"] + p["width"] > sheet["width"] + EPS:
                        problems.append(f"Sheet {si}: tấm {p['name']} tràn mép")
                    x += p["width"]
                    for zone in sheet.get("trimZones") or []:
                        if rects_overlap(p, zone):
                            problems.append(f"Sheet {si}: tấm {p['name']} đè vùng trim")
        remnant = remnant_area_of(sheet)
        trim_area = trim_area_of(sheet["width"], sheet["height"], trim)
        total = packed + trim_area + scrap + remnant
        sheet_area = sheet["width"] * sheet["height"]
        if not nearly_area(total, sheet_area, sheet_area):
            problems.append(
                f"Sheet {si}: packed+trim+scrap+remnant={total} ≠ sheetArea={sheet_area}"
            )
    return problems
