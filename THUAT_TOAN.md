# Hàm logic — cắt carton 2 giai đoạn

Nguồn đang chạy: `cutting_stock.py`. Điểm vào: `suggest_plans`. Bài toán / ràng buộc máy: `AGENTS.md`. Cách chạy: `README.md`.

`src/solver.js` là port JS cùng thuật toán (test `npm test`). Web **không** gọi file này. Khác biệt nhỏ: JS nhận `options = {allowRotation, maxPlans}`; SAMPLE JS đặt tên `10×20` / `5×10` / `2×3` thay vì A/B/C; plan JS không gắn `best`.

Hằng số: `EPS = 1e-6` (vừa / tràn mép), `nearly` dùng `1e-4`.

Toạ độ sau layout: gốc **trên-trái**, `x` tăng sang phải (Rộng), `y` tăng xuống (Dài). Dải xếp từ trên xuống. Tấm trong dải xếp trái → phải.

Luồng:

```
normalize
    → mỗi hướng tấm nguyên (giữ / xoay 90°)
        → each_assignment (hướng xoay từng khổ)
            → candidate_from
                  make_strips_*     (tạo dải)
                      fill_strip / knapsack_*
                  pack_strips_into_sheets + layout_sheet
                  metrics_of, build_cuts, score_plan
    → lọc trùng (layout_hash) → xếp theo score → tối đa max_plans
```

---

## 1. Điểm vào

### `suggest_plans(sheet_input, items_input, allow_rotation=True, max_plans=6)`

Sinh vài cách cắt, **cách đầu tiên là tốt nhất**.

1. `normalize` — lỗi thì `{ok: False, errors, plans: []}`.
2. Duyệt 2 hướng tấm nguyên (giữ / xoay 90° — `swapped`).
3. Với mỗi hướng tấm, `each_assignment` duyệt hướng xoay từng khổ.
4. Mỗi assignment thử 3 `mix` × vài `fill_mode` × 2 `bin_mode`:

   | Tham số | Giá trị | Ý nghĩa |
   |---|---|---|
   | `mix` | `False` / `True` / `"backfill"` | tách khổ / trộn hàng / dư hàng trộn |
   | `fill_mode` | `"dp"` / `"wide"` / `"narrow"` | cách nhét 1 dải — **chỉ khi `mix is True`** |
   | `bin_mode` | `"keep"` / `"first"` | thứ tự nhét dải vào tấm |

   `mix` khác `True` vẫn truyền `fill_mode="dp"` vào `candidate_from` nhưng homogeneous không dùng; backfill tự gọi `fill_strip(..., "dp")` cho khe dư.

5. Gộp plan trùng `layout_hash`, giữ bản `score_plan` nhỏ hơn.
6. Sort lexicographic, lấy `max_plans` cái. Gán `id=plan-N`, `title=Cách N`, `best=(N==1)`, `label` = `mix_label` + `"xoay tấm"` nếu `swapped`.

`fill_modes_mixed`: kích thước gần nguyên (`all_ints`) thì `["dp", "wide"]`, không thì `["wide", "narrow"]` (DP làm tròn số nguyên).

Không xếp được khổ nào: `{ok: True, plans: [], message: "Không xếp được khổ nào vào tấm (kể cả khi xoay). ..."}`.

---

## 2. Chuẩn hoá & hướng xoay

### `normalize(sheet_input, items_input)`

Ép `width/height/quantity` sang số, kiểm tra dương; SL phải nguyên. Tên trống → `"{w}×{h}"`. Gán `key = "{name}::{w}x{h}"`.

Trả `(errors, sheet, items)`.

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

Làm tròn `capacity` / `width` sang int. Fallback `knapsack_greedy(..., wide_first=True)` khi `capacity > 900` hoặc `Σ qty × (W+1) > 250_000`.

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

### `layout_sheet(strips, sheet_w, sheet_h)`

Gán toạ độ:

- Dải từ trên xuống (`y` tăng).
- Tấm trong dải trái → phải (`x` tăng).
- `scrapWidth = sheet_w - usedWidth` (vụn trong hàng).
- `usedHeight` = tổng chiều dài dải.
- `remnant` = dải nguyên còn lại dưới cùng `{x:0, y, width: sheet_w, height}`.

---

## 6. Chấm điểm & xuất plan

### `score_plan(plan)` → tuple, **nhỏ hơn tốt hơn**

1. Σ `unpacked.quantity`
2. `sheetCount`
3. `scrapArea`
4. `stripCount`
5. `cutCount`
6. `wasteArea`

`better_score(a, b)` = `a < b` (so tuple).

### `metrics_of(sheets, items, sheet_w, sheet_h)`

| Field | Nghĩa |
|---|---|
| `sheetCount` | số tấm nguyên |
| `stripCount` | tổng số dải |
| `usedArea` | Σ rộng×dài tấm đã xếp |
| `sheetArea` | `sheetCount × W × H` |
| `wasteArea` | `sheetArea − usedArea` (= scrap + remnant) |
| `wasteRatio` | `wasteArea / sheetArea` |
| `scrapArea` | Σ `scrapWidth × strip.height` — không tái sử dụng |
| `remnantArea` | Σ phần dư dưới tấm |
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

`desc.sheetTxt` nói có xoay tấm nguyên hay không. `desc.rows`: `"{name} → hàng dài {stripH} (xoay 90°)"`.

---

## 7. Phụ trợ

| Hàm | Việc |
|---|---|
| `fmt(n)` | Số gọn cho hash / nhãn (`100`, `10.5`) |
| `nearly(a, b)` | `abs < 1e-4` |
| `is_positive_number(n)` | finite và `> 0` |
| `all_ints(sheet, items)` | mọi kích thước gần nguyên → bật DP |
| `count_packed(sheets)` | đếm SL theo `key` (kèm name/orig size) |
| `assert_valid_plan(plan)` | dải không vượt tấm; tấm cùng dài dải, thẳng hàng, không tràn mép. List lỗi (rỗng = OK) |

`assert_valid_plan` **không** kiểm tra đủ đơn, không chồng theo diện tích tổng, không khớp `cuts`.

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
  width, height, usedHeight,
  strips: [{ y, height, usedWidth, scrapWidth, pieces }],
  remnant: { x, y, width, height }
}
```

**Plan trả về UI**

```text
{
  id, title, best, label,
  sheetWidth, sheetHeight, swapped, mix,
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
