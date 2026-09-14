# Cắt tấm carton 2 giai đoạn (guillotine)

Bạn là lập trình viên Python chuyên Operations Research / combinatorial optimization.
Nhiệm vụ: cải thiện hàm xếp cắt trong `cutting_stock.py`. Bài toán xác định — không dùng ML / mạng nơ-ron.

Cài đặt, chạy web, API: xem `README.md`. Chi tiết từng hàm: `THUAT_TOAN.md`.

## Bài toán

Xưởng cắt nhiều khổ hộp từ tấm carton nguyên cùng kích thước. Số tấm nguyên không giới hạn.

**Máy chỉ cắt hàng loạt, đúng 2 giai đoạn:**

1. Cắt **ngang xuyên suốt tấm** → các **dải** cùng chiều cao.
2. Cắt **dọc từng dải** → từng tấm hộp.

Trong một dải, **mọi tấm phải cùng chiều cao** (sau khi xoay 90° nếu được phép). Lệch hàng thì nhát ngang sẽ hư hộp — nested / free-form 2D packing **không hợp lệ**.

Được xoay tấm nguyên 90° (đổi cạnh cắt ngang) và xoay từng khổ 90° nếu không kỵ hướng sóng.

## Điểm vào

```python
suggest_plans(sheet, items, allow_rotation=True, max_plans=6)
```

- `sheet = {width, height}`
- `items = [{name, width, height, quantity}, ...]` — `quantity` nguyên dương
- Trả `{ok, errors, plans, demand, sheet}`. `plans[0]` là tốt nhất.

Mỗi plan: `sheets` (toạ độ dải/tấm), `cuts` (thứ tự cắt), `metrics`. Giữ nguyên chữ ký và shape JSON — UI đang đọc.

Đơn mẫu: `SAMPLE` trong `cutting_stock.py` (tấm 100×200; 10×20×10, 5×10×15, 2×3×20). Đơn vị tự chọn, miễn nhất quán.

## Mục tiêu (lexicographic, nhỏ hơn = tốt hơn)

`score_plan`:

1. `unpacked` — khổ chưa xếp (phải đủ đơn nếu tấm đủ lớn)
2. `sheetCount` — số tấm nguyên
3. `scrapArea` — vụn trong hàng
4. `stripCount` — số dải
5. `cutCount` — số nhát
6. `wasteArea` — tổng hao phí

Remnant (dải nguyên còn lại dưới tấm) tái sử dụng được — phạt `scrapArea` trước `wasteArea`.

Ba kiểu mix **phải giữ**: `False` (mỗi hàng một khổ), `True` (trộn cùng chiều cao), `"backfill"` (cùng khổ trước, dư hàng mới trộn).

## Ràng buộc bắt buộc

- Cắt ngang xuyên tấm trước; không cắt dọc xuyên tấm trước (trừ khi xoay cả tấm nguyên).
- Mọi tấm trong một dải cùng `height` = chiều cao dải.
- Không tràn mép, không chồng, xếp sát trái → phải theo hàng.
- Khổ lớn hơn tấm (kể cả khi xoay) → không xếp, báo rõ, không bịa layout.
- Mọi plan trả về phải `assert_valid_plan(plan) == []`.

## File

| File | Việc |
|---|---|
| **`cutting_stock.py`** | Sửa thuật toán ở đây. |
| `THUAT_TOAN.md` | Luồng hàm (xoay, knapsack, mix, pack, score). |
| `app.py` | Flask `POST /api/suggest`. |
| `index.html`, `src/` | UI. Không đổi API nếu chưa cần. |
| `test_cutting_stock.py` | Test bắt buộc. |
| `README.md` | Cài đặt / chạy web. |

Không thêm `rectpack`, matplotlib CLI, tồn kho / mua ngoài.

`src/solver.js` là bản JS cũ — **không** phải solver đang chạy trên web. Đừng “sửa thuật toán” ở đó trừ khi đồng bộ có chủ đích.

## Khi sửa thuật toán

- Heuristic / DP / exact search đều được; phải **deterministic**, chạy nhanh trên vài loại khổ, vài trăm tấm.
- Ưu tiên đủ đơn và ít tấm nguyên hơn “vẽ đẹp”.
- Comment ngắn, giải thích ràng buộc máy — không kể lại từng bước.
- Đổi heuristic thì thêm test (đơn mẫu 1 tấm, 5×5 lấp kín, khổ quá to, nhiều tấm, trộn cùng chiều cao).

```bash
python -m unittest test_cutting_stock.py -v
python app.py    # http://127.0.0.1:5000 — Đơn mẫu → Gợi ý cách cắt
```
