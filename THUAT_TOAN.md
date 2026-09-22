# Hàm logic — cắt carton 2 giai đoạn

Nguồn đang chạy: `cutting_stock.py`. Điểm vào: `suggest_plans`. Bài toán / ràng buộc máy: `AGENTS.md`. Cách chạy: `README.md`.

`src/solver.js` là port JS cùng thuật toán (test `npm test`). Web **không** gọi file này. Khác biệt nhỏ: JS nhận `options = {allowRotation, maxPlans}`; SAMPLE JS đặt tên `10×20` / `5×10` / `2×3` thay vì A/B/C; plan JS không gắn `best`.

Hằng số: `EPS = 1e-6` (vừa / tràn mép), `nearly` dùng `1e-4`.

Toạ độ sau layout: gốc **trên-trái**, `x` tăng sang phải (Rộng), `y` tăng xuống (Dài). Dải xếp từ trên xuống. Tấm trong dải xếp trái → phải.

Luồng:

```
normalize (sheet + trim → khổ hữu dụng)
    → packing_options: giữ tờ / (nếu allowSheetRotation) xoay hướng cắt + remap trim
        → each_assignment (xoay từng BTP trên khổ hữu dụng)
            → candidate_from
                  make_strips_*     (capacity = usableW)
                      fill_strip / knapsack_*
                  pack_strips_into_sheets + layout_sheet (offset trim)
                  nếu swapped: transform về tờ vật lý origW×origH
                  metrics_of, build_cuts, score_plan
    → lọc trùng (layout_hash) → xếp theo score → tối đa max_plans
```

---

## 1. Điểm vào

### `suggest_plans(sheet_input, items_input, allow_rotation=True, max_plans=6, trim_input=None, allow_piece_rotation=None, allow_sheet_rotation=False)`

Sinh vài cách cắt, **cách đầu tiên là tốt nhất**.

`allow_rotation` (cũ) map sang `allow_piece_rotation`. `allow_sheet_rotation` mặc định **False**.

1. `normalize` (kèm trim) — lỗi thì `{ok: False, errors, plans: []}`. Khổ hữu dụng ≤ 0 → lỗi rõ.
2. Duyệt hướng tờ: luôn giữ orig W×H. Nếu `allow_sheet_rotation`, thêm phương án xoay hướng cắt (remap trim theo cạnh vật lý, **không** đổi 2200×3000 thành 3000×2200).
3. Với mỗi hướng, `each_assignment` duyệt xoay từng BTP trên **khổ hữu dụng**.
4. Mỗi assignment thử 3 `mix` × vài `fill_mode` × 2 `bin_mode`:

   | Tham số | Giá trị | Ý nghĩa |
   |---|---|---|
   | `mix` | `False` / `True` / `"backfill"` | tách khổ / trộn hàng / dư hàng trộn |
   | `fill_mode` | `"dp"` / `"wide"` / `"narrow"` | cách nhét 1 dải — **chỉ khi `mix is True`** |
   | `bin_mode` | `"keep"` / `"first"` | thứ tự nhét dải vào tấm |

   `mix` khác `True` vẫn truyền `fill_mode="dp"` vào `candidate_from` nhưng homogeneous không dùng; backfill tự gọi `fill_strip(..., "dp")` cho khe dư.

5. Gộp plan trùng `layout_hash`, giữ bản `score_plan` nhỏ hơn.
6. Sort lexicographic, lấy `max_plans` cái. Gán `id=plan-N`, `title=Cách N`, `best=(N==1)`, `label` = `mix_label` + `"xoay hướng cắt tấm nguyên"` nếu `swapped`.

`fill_modes_mixed`: kích thước gần nguyên (`all_ints`) thì `["dp", "wide"]`, không thì `["wide", "narrow"]` (DP làm tròn số nguyên).

Không xếp được khổ nào: `{ok: True, plans: [], message: "Không xếp được khổ nào vào khổ hữu dụng (kể cả khi xoay). ..."}`.

---

## 2. Chuẩn hoá & hướng xoay

### `normalize(sheet_input, items_input, trim_input=None)`

Ép `width/height/quantity` sang số, kiểm tra dương; SL phải nguyên. Tên trống → `"{w}×{h}"`. Gán `key = "{name}::{w}x{h}"`.

Trim `{left,right,top,bottom}` ≥ 0, mặc định 0.  
`usableW = width − left − right`, `usableH = height − top − bottom`. ≤ 0 → lỗi.

Trả `(errors, sheet, items)` với `sheet` có `trim`, `usableWidth`, `usableHeight`.

### `orientations_for(item, sheet_w, sheet_h, allow_rotation)`

Mỗi khổ tối đa 2 cách đặt lên dải:

| | `rotated` | Chiều dài dải `stripH` | Chiều ngang tấm `pieceW` |
|---|---|---|---|
| Không xoay | `False` | `item.height` | `item.width` |
| Xoay 90° | `True` | `item.width` | `item.height` |

Bỏ hướng không vừa tấm (`<= sheet_* + EPS`). Hình vuông không xoay (trùng layout).

### `each_assignment(items, sheet_w, sheet_h, allow_rotation, visit)`

Gán **một hướng** cho mỗi khổ, gọi `visit(assignment)`.

- Tích số hướng ≤ 24: duyệt hết tổ hợp.
- Lớn hơn: 4 heuristic, mỗi khổ chọn 1 hướng:
  - `first` — hướng đầu tiên vừa tấm
  - `tall` — `stripH` lớn nhất
  - `wide` — `pieceW` lớn nhất
  - `fill` — đầy ngang tấm nhất (`per * pieceW`), rồi ít dải nhất (`ceil(qty / per)`)

`assignment` = `[{item, orient}, ...]`. `orient is None` = khổ không vừa. `visit` bỏ qua nếu mọi `orient` đều `None`.

---

## 3. Xếp một dải (knapsack 1D)

Cùng chiều dài dải → bài toán 1D: nhét các `width` vào `sheet_w`.

Mọi hàm fill trả `{used, counts}` — `counts[id] = số tấm`.

### `knapsack_greedy(capacity, types, wide_first=True)`

Sort theo `width` (rộng trước hoặc hẹp trước), lần lượt lấy tối đa `min(qty, floor(còn / width))`.

### `knapsack_dp(capacity, types)`

DP bounded-per-type (trần `qty`): tại mỗi độ rộng `w` giữ packing **nhiều tấm nhất**. Kết quả cuối: **độ rộng đã dùng lớn nhất** còn reachable (đầy dải), không phải “nhiều tấm nhất trên mọi packing”.

Làm tròn `capacity` / `width` sang int. Fallback `knapsack_greedy(..., wide_first=True)` khi `capacity > 20_000` hoặc `Σ qty × (W+1) > 250_000` (trần 900 cũ quá thấp cho khổ mm, vd. hữu dụng 2150).

### `fill_strip(capacity, types, integer_mode, fill_mode)`

Lọc `qty > 0` và `width <= capacity`.

| `fill_mode` | Khi nào | Hàm |
|---|---|---|
| `"narrow"` | heuristic hẹp trước | greedy hẹp→rộng |
| `"wide"` | hoặc `integer_mode` sai | greedy rộng→hẹp |
| `"dp"` | nguyên, mặc định | `knapsack_dp` |

### `expand_pieces(counts, type_by_id, strip_h)`

`counts` → danh sách tấm, sort rộng trước (cùng khổ đứng cạnh nhau trên dải). Mỗi tấm: `width=pieceW`, `height=strip_h`, kèm `rotated/origW/origH/key/name`. Chưa có `x,y`.

---

## 4. Tạo dải từ đơn

`assignment` đã chốt hướng xoay từng khổ. Mỗi strip: `{height, usedWidth, pieces}` — chưa toạ độ tấm.

### `make_strips_homogeneous(sheet_w, assignment)` — `mix=False`

Mỗi hàng **một khổ**. `per = floor(sheet_w / pieceW)` tấm/dải, lặp đến hết SL.

Cắt đồng loạt cùng size.

### `make_strips_mixed(sheet_w, assignment, integer_mode, fill_mode)` — `mix=True`

Gom khổ theo `stripH`. Mỗi nhóm: lặp `fill_strip` đến hết SL (cùng chiều dài mới được trộn). Không nhét được thêm thì dừng phần dư (sẽ thành `unpacked`).

### `make_strips_backfill(sheet_w, assignment, integer_mode)` — `mix="backfill"`

Duyệt khổ theo thứ tự assignment. Với từng khổ còn SL: xếp full hàng cùng khổ trước. Khe ngang còn lại mới `fill_strip(..., "dp")` các khổ **cùng `stripH`** còn leftover.

---

## 5. Xếp dải vào tấm (bin packing 1D theo chiều dài)

### `pack_strips_into_sheets(strips, sheet_w, sheet_h, bin_mode)`

Dải cao hơn tấm → `{sheets: [], leftoverStrips: strips}` → candidate bị loại.

| `bin_mode` | Thứ tự dải | Chọn tấm |
|---|---|---|
| `"keep"` | giữ thứ tự tạo | first-fit |
| `"first"` | cao → thấp | first-fit |
| `"best"` | cao → thấp | best-fit (khe dọc nhỏ nhất) — **có trong hàm, `suggest_plans` không gọi** |

Tấm mới khi không nhét được dải vào tấm cũ. `leftoverStrips` luôn `[]` khi thành công (mọi dải đều vào bin).

### `layout_sheet(strips, pack_opt)`

Pack trên khổ hữu dụng, cộng offset trim:

- Dải từ `y = trim.top` xuống.
- Tấm trong dải từ `x = trim.left` sang phải.
- `scrapRect` = khe còn lại **trong hàng hữu dụng** (không phải Trim).
- `remnant` = dải nguyên còn lại trong khổ hữu dụng.
- `trimZones` + `usableRect` trên tờ đầy đủ orig W×H.

Nếu `swapped`: `transform_sheet_to_original` đưa geometry về tờ vật lý; `sheetWidth/Height` luôn orig.

---

## 6. Chấm điểm & xuất plan

### `score_plan(plan)` → tuple, **nhỏ hơn tốt hơn**

1. Σ `unpacked.quantity`
2. `sheetCount`
3. `wasteRatio` (hay −utilization) — trên tấm nguyên đầy đủ, gồm trim
4. `scrapArea`
5. `-remnantArea`
6. `stripCount`
7. `cutCount`

`better_score(a, b)` = `a < b` (so tuple).

### `metrics_of(sheets, items, orig_w, orig_h, trim, cut_count=None)`

Tính trên diện tích tấm nguyên **đầy đủ** (gồm trim):

| Field | Nghĩa |
|---|---|
| `sheetCount` | số tấm nguyên |
| `stripCount` | tổng số dải |
| `usedArea` / `packedArea` | Σ rộng×dài BTP đã xếp |
| `sheetArea` | `sheetCount × origW × origH` |
| `trimArea` | phần biên máy |
| `usableArea` / `usableWidth` / `usableHeight` | khổ hữu dụng |
| `wasteArea` | `sheetArea − packedArea` (= trim + scrap + remnant) |
| `wasteRatio` | `wasteArea / sheetArea` |
| `utilization` | `packedArea / sheetArea` |
| `scrapArea` | vụn trong hàng — không tái sử dụng |
| `remnantArea` | dải nguyên còn lại — tái sử dụng |
| `trim` | `{left,right,top,bottom}` |
| `remnantLabel` | `"W×H, ..."` hoặc `"không còn dải nguyên"` |
| `cutCount` | xem công thức dưới |
| `packedCount` / `demandCount` | số tấm đã xếp / số tấm đơn |
| `unpacked` | list `{name,width,height,quantity}` còn thiếu |

**`cutCount`**

- Mỗi dải: `max(số tấm − extra, 0)` với `extra = 1` nếu hàng đầy (`scrapWidth ≈ 0`, không cắt mép phải), `extra = 0` nếu còn scrap (cắt tách tấm cuối khỏi vụn).
- Cắt ngang: nếu còn remnant thì `+ số dải` (tách cả dải cuối khỏi phần dư); hết tấm thì `+ max(số dải − 1, 0)`.

### `build_cuts(sheets)`

Thứ tự máy cắt, 1-based:

```text
[{ sheet, horizontal: [y, ...], vertical: [{ strip, y, height, positions: [x, ...] }] }]
```

- `horizontal`: Y các đường ngang (bỏ mép dưới nếu hết tấm).
- `vertical[i].positions`: X trên dải `i` (bỏ mép phải nếu hết ngang).

### `layout_hash(sheets)`

Chuỗi `W×H` + dải (`height@y:key:w×h,...`). Hai layout giống nhau (khác mix/fill) chỉ giữ 1.

### `candidate_from(...)`

`make_strips_*` → `pack_strips_into_sheets` → `metrics_of` + `build_cuts` + `describe` + `hash`. `None` nếu không tạo được dải/tấm.

### `describe` / `mix_label`

Text UI:

| `mix` | `mix_label` | `desc.mixTxt` |
|---|---|---|
| `False` | tách khổ | Mỗi hàng chỉ một khổ — cắt đồng loạt cùng size |
| `True` | trộn hàng | Trộn các khổ cùng chiều dài trong một hàng |
| `"backfill"` | dư hàng trộn | Xếp cùng khổ trước, phần dư hàng mới trộn |

`desc.sheetTxt` = `"Xoay hướng cắt tấm nguyên"` nếu swapped, không ghi thành 3000×2200. `desc.rows`: `"{name} → hàng dài {stripH} (xoay 90°)"`.

---

## 7. Phụ trợ

| Hàm | Việc |
|---|---|
| `fmt(n)` | Số gọn cho hash / nhãn (`100`, `10.5`) |
| `nearly(a, b)` | `abs < 1e-4` |
| `is_positive_number(n)` | finite và `> 0` |
| `all_ints(sheet, items)` | mọi kích thước gần nguyên → bật DP |
| `count_packed(sheets)` | đếm SL theo `key` (kèm name/orig size) |
| `assert_valid_plan(plan)` | không đè trim; cùng dài dải / thẳng hàng; packed+trim+scrap+remnant = sheetArea; tờ không đổi nhãn W×H |

`assert_valid_plan` **không** kiểm tra đủ đơn, không khớp `cuts`.

---

## 8. Cấu trúc dữ liệu

**Hướng xoay**

```text
{ rotated, stripH, pieceW }
```

**Tấm trên dải (sau layout)**

```text
{ key, name, width, height, rotated, origW, origH, x, y }
```

`width/height` là kích thước **sau xoay**; `origW/origH` là khổ đơn hàng.

**Tấm nguyên đã layout**

```text
{
  width, height, usedHeight,           # luôn orig W×H
  origSheetWidth, origSheetHeight, swapped,
  trim, trimZones, usableRect,
  strips: [{ y, height, usedWidth, scrapWidth, scrapRect, orientation, pieces }],
  remnant: { x, y, width, height }
}
```

**Plan trả về UI**

```text
{
  id, title, best, label,
  sheetWidth, sheetHeight, origSheetWidth, origSheetHeight, swapped, mix,
  desc: { sheetTxt, mixTxt, rows },
  sheets, cuts, metrics
}
```

`SAMPLE`:

```text
sheet 100×200
A 10×20 × 10
B  5×10 × 15
C  2×3  × 20
```
