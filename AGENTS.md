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

Xoay **từng BTP** 90° (`allowPieceRotation`) nếu không kỵ hướng sóng. Xoay **hướng cắt tấm nguyên** (`allowSheetRotation`, mặc định **tắt**) chỉ thử cạnh cắt ngang khác — không đổi nhãn Rộng/Dài, không im lặng đổi 2200×3000 thành 3000×2200.

**Trim** là biên xén máy, khai báo trước, trừ trước. Pack trên khổ hữu dụng. Cấm gọi khe còn lại sau packing là Trim. Cấm xếp BTP lên vùng trim. Cấm tăng hiệu suất bằng cách bỏ trim hoặc đổi nhãn rộng/dài.

Trên UI, cạnh thứ hai gọi là **Dài** (không phải “cao”). Trong code đó là `height` / `stripH` / trục `y` (gốc trên-trái, `y` tăng xuống). Ô nhập `width` = Rộng, `height` = Dài đúng số người dùng gõ.

## Điểm vào

```python
suggest_plans(
    sheet, items,
    allow_rotation=True, max_plans=6,
    trim_input=None,
    allow_piece_rotation=None,   # None → allow_rotation (tương thích API cũ)
    allow_sheet_rotation=False,
)
```

- `sheet = {width, height}` — số dương; `width` = Rộng, `height` = Dài
- `trim_input = {left, right, top, bottom}` — tất cả ≥ 0, mặc định 0
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
  id, title, best, label,          # "Cách 1", "trộn hàng · xoay Tấm nguyên BTP"
  sheetWidth, sheetHeight, origSheetWidth, origSheetHeight, swapped, mix,
  desc: { sheetTxt, mixTxt, rows },
  sheets, cuts, metrics
}
```

`demand` là `items` đã `normalize` (có `key = "{name}::{w}x{h}"`).

Đơn mẫu Python: `SAMPLE` trong `cutting_stock.py` — tấm 100×200; A 10×20×10, B 5×10×15, C 2×3×20. `GET /api/sample` vẫn trả mẫu này. UI version 3 không load mẫu: đơn vào từ query string `rong`, `dai`, `trai`, `phai`, `tren`, `duoi`, `n`, `items` (tuỳ chọn `item` lặp, `xoay`, `xoayTo`). `n` mở dòng trống khi chưa có `items`; có danh sách thì lấy `items`.

## Mục tiêu (lexicographic, nhỏ hơn = tốt hơn)

`score_plan` → tuple, nhỏ hơn = tốt hơn:

1. Σ `unpacked.quantity` — khổ chưa xếp (phải đủ đơn nếu tấm đủ lớn)
2. `sheetCount` — số tấm nguyên
3. `wasteRatio` (= 1 − utilization; tính trên diện tích tấm nguyên **đầy đủ**, gồm trim)
4. `scrapArea` — vụn **trong hàng** (không tái sử dụng)
5. `-remnantArea` — ưu tiên dải nguyên còn lại lớn
6. `stripCount` — số dải / hàng ngang
7. `cutCount` — số nhát

`utilization = packedArea / sheetArea`, `wasteRatio = (sheetArea − packedArea) / sheetArea`.
Trim trừ trước; scrap/remnant chỉ nằm trong khổ hữu dụng.

Ba kiểu mix **phải giữ**:

| `mix` | Ý nghĩa |
|---|---|
| `False` | mỗi hàng một khổ |
| `True` | trộn các khổ cùng `stripH` |
| `"backfill"` | xếp cùng khổ trước, khe ngang mới trộn |

## Ràng buộc bắt buộc

- Cắt ngang xuyên khổ hữu dụng trước; không cắt dọc xuyên trước (trừ khi `allowSheetRotation` — lúc đó cạnh cắt ngang đổi, tờ vẫn orig W×H).
- Trim trừ trước. BTP (kể cả xoay) phải vừa `usableW × usableH`. Toạ độ BTP trong `[trim.left, trim.left+usableW] × [trim.top, trim.top+usableH]`.
- Mọi tấm trong một dải: cùng chiều dài dải, sát nhau, không chồng, không tràn, **không đè trim**.
- `packed + trim + scrap + remnant = sheetArea` (trong EPS).
- Khổ lớn hơn khổ hữu dụng (kể cả khi xoay) → `plans: []` + `message` rõ, không bịa layout.
- Mọi plan trả về phải `assert_valid_plan(plan) == []`.
- Deterministic; chạy nhanh trên vài loại khổ, vài trăm tấm. Không thêm rectpack.

## File

| File | Việc |
|---|---|
| **`cutting_stock.py`** | Solver đang chạy. Sửa thuật toán ở đây. |
| `app.py` | Flask: UI tĩnh + `GET /api/sample` + `POST /api/suggest`. |
| `index.html` | Form đơn, nút **Bắt đầu cắt**. Không còn mẫu ví dụ. |
| `src/main.js` | Đọc query string, gọi API Python, state form / plan đang chọn. |
| `src/query.js` | Đọc / ghi query string đơn hàng. |
| `src/examples.js` | Dữ liệu mẫu cũ. Form version 3 không gắn mẫu này. |
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

- Thẻ plan: `id`, `title`, `best`, `label`, `metrics.{utilization,wasteRatio,trimArea,scrapArea,remnantLabel,sheetCount,stripCount,wasteArea,cutCount,unpacked}`
- Viewer: `sheets[].{width,height,usedHeight,strips,remnant,trimZones,usableRect}` và `pieces[].{key,name,width,height,rotated,origW,origH,x,y}`
- Cắt: `cuts[].{sheet,horizontal,vertical[{strip,y,height,positions}]}` + `sheetWidth/sheetHeight`
- Legend: `demand[].{key,name,width,height,quantity}`
- Mô tả: `desc.{sheetTxt,mixTxt,rows}`

`unpacked` là **list** `{name,width,height,quantity}`, không phải số.

## Khi sửa thuật toán

- Heuristic / DP / exact search đều được; phải deterministic.
- Ưu tiên đủ đơn và ít tấm nguyên hơn “vẽ đẹp”.
- Comment ngắn, giải thích ràng buộc máy — không kể lại từng bước.
- Đổi heuristic thì thêm test. Hiện có: đơn mẫu 1 tấm / 45 hộp, ít scrap, 5×5 lấp kín, khổ quá to, nhiều tấm, trộn cùng chiều dài, **poster 2200×3000 trim 25 (hiệu suất 97.73%)**, cấm đè trim, utilization gồm trim.
- Chạy:

```bash
python -m unittest test_cutting_stock.py -v
python app.py    # http://127.0.0.1:5000 — form trống, hoặc mở link có query string
```
