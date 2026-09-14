# Hàm logic — cắt carton 2 giai đoạn

Nguồn: `cutting_stock.py`. Điểm vào: `suggest_plans`. Bài toán và ràng buộc máy nằm ở `AGENTS.md`.

Luồng:

```
normalize
    → each_assignment (hướng xoay từng khổ)
        → candidate_from
              make_strips_*     (tạo dải)
                  fill_strip / knapsack_*
              pack_strips_into_sheets + layout_sheet
              metrics_of, build_cuts, score_plan
    → lọc trùng (layout_hash) → xếp theo score → tối đa 6 plan
```

---

## 1. Điểm vào

### `suggest_plans(sheet_input, items_input, allow_rotation=True, max_plans=6)`

Sinh vài cách cắt, **cách đầu tiên là tốt nhất**.

1. `normalize` — lỗi thì `{ok: False, errors, plans: []}`.
2. Duyệt 2 hướng tấm nguyên (giữ / xoay 90°).
3. Với mỗi hướng tấm, `each_assignment` duyệt hướng xoay từng khổ.
4. Mỗi assignment thử 3 `mix` × vài `fill_mode` × 2 `bin_mode`:

   | Tham số | Giá trị | Ý nghĩa |
   |---|---|---|
   | `mix` | `False` / `True` / `"backfill"` | tách khổ / trộn hàng / dư hàng trộn |
   | `fill_mode` | `"dp"` / `"wide"` / `"narrow"` | cách nhét 1 dải (chỉ khi `mix is True`) |
   | `bin_mode` | `"keep"` / `"first"` | thứ tự nhét dải vào tấm |

5. Gộp plan trùng `layout_hash`, giữ bản `score_plan` nhỏ hơn.
6. Sort lexicographic, lấy `max_plans` cái.

`fill_modes_mixed`: kích thước nguyên thì `["dp", "wide"]`, không thì `["wide", "narrow"]` (DP cần làm tròn số nguyên).

---

## 2. Chuẩn hoá & hướng xoay

### `normalize(sheet_input, items_input)`

Ép `width/height/quantity` sang số, kiểm tra dương; SL phải nguyên. Gán `key = "{name}::{w}x{h}"`.

Trả về `(errors, sheet, items)`.

### `orientations_for(item, sheet_w, sheet_h, allow_rotation)`

Mỗi khổ tối đa 2 cách đặt lên dải:

| | `rotated` | Chiều cao dải `stripH` | Chiều ngang tấm `pieceW` |
|---|---|---|---|
| Không xoay | `False` | `item.height` | `item.width` |
| Xoay 90° | `True` | `item.width` | `item.height` |

Bỏ hướng không vừa tấm. Hình vuông không xoay (trùng layout).

### `each_assignment(items, sheet_w, sheet_h, allow_rotation, visit)`

Gán **một hướng** cho mỗi khổ, gọi `visit(assignment)`.

- Tích số hướng ≤ 24: duyệt hết tổ hợp.
- Lớn hơn: 4 heuristic, mỗi khổ chọn 1 hướng:
  - `first` — hướng đầu tiên vừa tấm
  - `tall` — `stripH` lớn nhất
  - `wide` — `pieceW` lớn nhất
  - `fill` — đầy ngang tấm nhất, rồi ít dải nhất

`assignment` = `[{item, orient}, ...]`. `orient is None` = khổ không vừa.

---

## 3. Xếp một dải (knapsack 1D)

Cùng chiều cao dải → bài toán 1D: nhét các `width` vào `sheet_w`.

Mọi hàm fill trả `{used, counts}` — `counts[id] = số tấm`.

### `knapsack_greedy(capacity, types, wide_first=True)`

Sort theo `width` (rộng trước hoặc hẹp trước), lần lượt lấy tối đa `min(qty, floor(còn / width))`.

### `knapsack_dp(capacity, types)`

DP unbounded-per-type (có trần `qty`): tối đa **số tấm** trên dải, rồi lấy `used` rộng nhất.

Fallback `knapsack_greedy(..., wide_first=True)` khi `capacity > 900` hoặc `Σ qty × (W+1) > 250_000`.

### `fill_strip(capacity, types, integer_mode, fill_mode)`

| `fill_mode` | Khi nào | Hàm |
|---|---|---|
| `"narrow"` | heuristic hẹp trước | greedy hẹp→rộng |
| `"wide"` | hoặc kích thước không nguyên | greedy rộng→hẹp |
| `"dp"` | nguyên, mặc định | `knapsack_dp` |

### `expand_pieces(counts, type_by_id, strip_h)`

`counts` → danh sách tấm, sort rộng trước (cùng khổ đứng cạnh nhau trên dải).

---

## 4. Tạo dải từ đơn

`assignment` đã chốt hướng xoay từng khổ.

### `make_strips_homogeneous(sheet_w, assignment)` — `mix=False`

Mỗi hàng **một khổ**. `per = floor(sheet_w / pieceW)` tấm/dải, lặp đến hết SL.

Cắt đồng loạt cùng size.

### `make_strips_mixed(sheet_w, assignment, integer_mode, fill_mode)` — `mix=True`

Gom khổ theo `stripH`. Mỗi nhóm: lặp `fill_strip` đến hết SL (cùng chiều cao mới được trộn).

### `make_strips_backfill(sheet_w, assignment, integer_mode)` — `mix="backfill"`

Với từng khổ: xếp full hàng cùng khổ trước. Khe ngang còn lại mới `fill_strip` các khổ **cùng `stripH`**.

Mỗi phần tử strip: `{height, usedWidth, pieces}` — chưa có toạ độ tấm.

---

## 5. Xếp dải vào tấm (bin packing 1D theo chiều cao)

### `pack_strips_into_sheets(strips, sheet_w, sheet_h, bin_mode)`

Dải cao hơn tấm → thất bại (`sheets: []`).

| `bin_mode` | Thứ tự dải | Chọn tấm |
|---|---|---|
| `"keep"` | giữ thứ tự tạo | first-fit |
| `"first"` | cao → thấp | first-fit |
| `"best"` | cao → thấp | best-fit (khe dọc nhỏ nhất) — có trong hàm, `suggest_plans` hiện không gọi |

Tấm mới khi không nhét được dải vào tấm cũ.

### `layout_sheet(strips, sheet_w, sheet_h)`

Gán toạ độ:

- Dải xếp từ trên xuống (`y` tăng).
- Tấm trong dải xếp trái → phải (`x` tăng).
- `scrapWidth = sheet_w - usedWidth` (vụn trong hàng).
- `remnant` = dải nguyên còn lại dưới cùng `{x:0, y, width: sheet_w, height}`.

---

## 6. Chấm điểm & xuất plan

### `score_plan(plan)` → tuple, **nhỏ hơn tốt hơn**

1. `unpacked` — số tấm chưa xếp
2. `sheetCount` — số tấm nguyên
3. `scrapArea` — vụn trong hàng
4. `stripCount` — số dải
5. `cutCount` — số nhát
6. `wasteArea` — tổng hao phí

`better_score(a, b)` = `a < b`.

### `metrics_of(sheets, items, sheet_w, sheet_h)`

| Field | Nghĩa |
|---|---|
| `usedArea` | Σ rộng×cao tấm đã xếp |
| `scrapArea` | Σ `scrapWidth × strip.height` |
| `remnantArea` | Σ phần dư dưới tấm |
| `wasteArea` | `sheetCount × W × H − usedArea` |
| `cutCount` | nhát dọc trên dải + nhát ngang tách dải |
| `unpacked` | khổ còn thiếu so với đơn |

`wasteArea = scrapArea + remnantArea`. Phần dư dưới tấm tái sử dụng được — `score_plan` phạt `scrapArea` trước.

### `build_cuts(sheets)`

Thứ tự máy cắt:

- `horizontal`: toạ độ Y các đường ngang (không cắt mép dưới nếu hết tấm).
- `vertical[i].positions`: toạ độ X trên dải `i` (không cắt mép phải nếu hết ngang).

### `layout_hash(sheets)`

Chuỗi dải + khổ + kích thước. Hai layout giống nhau (khác mix/fill) chỉ giữ 1.

### `candidate_from(...)`

`make_strips_*` → `pack_strips_into_sheets` → `metrics_of` + `build_cuts` + `describe` + `hash`. `None` nếu không tạo được dải/tấm.

### `describe` / `mix_label`

Text UI: hướng tấm, kiểu mix, mỗi khổ vào hàng cao bao nhiêu.

---

## 7. Phụ trợ

| Hàm | Việc |
|---|---|
| `fmt(n)` | Số gọn cho hash / nhãn (`100`, `10.5`) |
| `nearly(a, b)` | `abs < 1e-4` |
| `is_positive_number(n)` | finite và `> 0` |
| `all_ints(sheet, items)` | mọi kích thước gần nguyên → bật DP |
| `count_packed(sheets)` | đếm SL theo `key` |
| `assert_valid_plan(plan)` | dải không vượt tấm; tấm cùng cao dải, thẳng hàng, không tràn mép. Trả list lỗi (rỗng = OK) |

---

## 8. Cấu trúc dữ liệu chính

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
