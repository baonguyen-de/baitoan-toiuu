# Cắt tấm carton 2 giai đoạn (guillotine)

Bạn là lập trình viên Python chuyên Operations Research / combinatorial optimization.
Nhiệm vụ: cải thiện hàm xếp cắt trong `cutting_stock.py`. Bài toán xác định — không dùng ML / mạng nơ-ron.

Cài đặt, chạy web, API, UI: `README.md`. Chi tiết từng hàm: `THUAT_TOAN.md`.

## Bài toán

Xưởng cắt nhiều khổ hộp từ tấm carton nguyên **cùng kích thước**. Số tấm nguyên không giới hạn.

**Máy chỉ cắt hàng loạt, đúng 2 giai đoạn:**

1. Cắt **ngang xuyên suốt tấm** → các **dải / hàng** cùng chiều dài (`stripH`).
2. Cắt **dọc từng dải** → từng tấm hộp. Không cắt dọc xuyên các dải khác.

Trong một dải, **mọi tấm phải cùng chiều dài** (sau khi xoay 90° nếu được phép). Lệch hàng thì nhát ngang sẽ hư hộp — nested / free-form 2D packing **không hợp lệ**.

Được xoay tấm nguyên 90° (đổi cạnh cắt ngang) và xoay từng khổ 90° nếu không kỵ hướng sóng.

Trên UI, cạnh thứ hai gọi là **Dài** (không phải “cao”). Trong code đó là `height` / `stripH` / trục `y` (gốc trên-trái, `y` tăng xuống).

## Điểm vào

```python
suggest_plans(sheet, items, allow_rotation=True, max_plans=6)
```

- `sheet = {width, height}` — số dương
- `items = [{name, width, height, quantity}, ...]` — `quantity` nguyên dương
- Đơn vị tự chọn, miễn nhất quán trong một lần gọi

**Trả về** (shape JSON UI đang đọc — đừng đổi nếu chưa cập nhật `src/`):

Lỗi nhập:

```text
{ ok: False, errors: [str], plans: [] }
```

Không xếp được khổ nào (kể cả xoay):

```text
{ ok: True, errors: [], plans: [], demand, sheet, message }
```

Thành công: `{ ok: True, errors: [], plans, demand, sheet }`. `plans[0]` là tốt nhất (`best: true`).

Mỗi plan:

```text
{
  id, title, best, label,          # "Cách 1", "trộn hàng · xoay tấm"
  sheetWidth, sheetHeight, swapped, mix,
  desc: { sheetTxt, mixTxt, rows },
  sheets, cuts, metrics
}
```

`demand` là `items` đã `normalize` (có `key = "{name}::{w}x{h}"`).

Đơn mẫu Python: `SAMPLE` trong `cutting_stock.py` — tấm 100×200; A 10×20×10, B 5×10×15, C 2×3×20. UI gọi `GET /api/sample` rồi ghi đè mẫu `chuan`.

## Mục tiêu (lexicographic, nhỏ hơn = tốt hơn)

`score_plan` → tuple:

1. Σ `unpacked.quantity` — khổ chưa xếp (phải đủ đơn nếu tấm đủ lớn)
2. `sheetCount` — số tấm nguyên
3. `scrapArea` — vụn **trong hàng** (không tái sử dụng)
4. `stripCount` — số dải / hàng ngang
5. `cutCount` — số nhát
6. `wasteArea` — tổng hao phí (`sheetArea − usedArea` = scrap + remnant)

Remnant (dải nguyên còn lại dưới tấm) tái sử dụng được — phạt `scrapArea` trước `wasteArea`.

Ba kiểu mix **phải giữ**:

| `mix` | Ý nghĩa |
|---|---|
| `False` | mỗi hàng một khổ |
| `True` | trộn các khổ cùng `stripH` |
| `"backfill"` | xếp cùng khổ trước, khe ngang mới trộn |

## Ràng buộc bắt buộc

- Cắt ngang xuyên tấm trước; không cắt dọc xuyên tấm trước (trừ khi xoay cả tấm nguyên — lúc đó cạnh cắt ngang đổi).
- Mọi tấm trong một dải: `piece.height == strip.height`, sát trái, cùng `y`, không chồng, không tràn mép.
- Khổ lớn hơn tấm (kể cả khi xoay) → `plans: []` + `message` rõ, không bịa layout.
- Mọi plan trả về phải `assert_valid_plan(plan) == []`.
- Deterministic; chạy nhanh trên vài loại khổ, vài trăm tấm.

## File

| File | Việc |
|---|---|
| **`cutting_stock.py`** | Solver đang chạy. Sửa thuật toán ở đây. |
| `app.py` | Flask: UI tĩnh + `GET /api/sample` + `POST /api/suggest`. |
| `index.html` | Form đơn, chọn mẫu, nút **Bắt đầu cắt**. |
| `src/main.js` | Gọi API Python, state form / plan đang chọn. |
| `src/examples.js` | Danh sách mẫu UI (chip nổi bật + dropdown). |
| `src/render.js` | Thẻ plan, metrics, SVG sơ đồ, zoom, hướng dẫn cắt. |
| `src/style.css` | Giao diện. |
| `src/solver.js` | Port JS **song song**, không phục vụ web. Chỉ đụng khi cố ý đồng bộ. |
| `src/solver.test.js` | `npm test` — test port JS. |
| `test_cutting_stock.py` | Test bắt buộc của solver Python. |
| `THUAT_TOAN.md` | Luồng hàm. |
| `README.md` | Cài đặt / chạy / API / Vercel. |
| `vercel.json` | Deploy Flask lên Vercel. Framework **bắt buộc** `flask` — đừng để Vite (có `package.json`). |
| `scripts/sync_vercel_public.py` | Build Vercel: copy `index.html` + UI `src/` → `public/` (CDN). |

Không thêm `rectpack`, matplotlib CLI, tồn kho / mua ngoài.

Web **bắt buộc** `python app.py` (http://127.0.0.1:5000). Vite không proxy API — đừng giả định `npm run dev` chạy được thuật toán.

Production Vercel: cùng `app` Flask + `cutting_stock.py`. UI tĩnh từ `public/` (CDN). Sửa giao diện ở `index.html` / `src/` — `scripts/sync_vercel_public.py` chạy lúc build.

## UI đang đọc (đừng gãy)

- Thẻ plan: `id`, `title`, `best`, `label`, `metrics.{sheetCount,stripCount,scrapArea,remnantLabel,wasteArea,wasteRatio,cutCount,unpacked}`
- Viewer: `sheets[].{width,height,usedHeight,strips,remnant}` và `pieces[].{key,name,width,height,rotated,origW,origH,x,y}`
- Cắt: `cuts[].{sheet,horizontal,vertical[{strip,y,height,positions}]}` + `sheetWidth/sheetHeight`
- Legend: `demand[].{key,name,width,height,quantity}`
- Mô tả: `desc.{sheetTxt,mixTxt,rows}`

`unpacked` là **list** `{name,width,height,quantity}`, không phải số.

## Khi sửa thuật toán

- Heuristic / DP / exact search đều được; phải deterministic.
- Ưu tiên đủ đơn và ít tấm nguyên hơn “vẽ đẹp”.
- Comment ngắn, giải thích ràng buộc máy — không kể lại từng bước.
- Đổi heuristic thì thêm test. Hiện có: đơn mẫu 1 tấm / 45 hộp, ít scrap, 5×5 lấp kín, khổ quá to, nhiều tấm, trộn cùng chiều dài.
- Chạy:

```bash
python -m unittest test_cutting_stock.py -v
python app.py    # http://127.0.0.1:5000 — mẫu tự load, «Bắt đầu cắt»
```
