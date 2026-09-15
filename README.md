# Bài toán tối ưu cắt — guillotine 2 giai đoạn

Gợi ý cách cắt nhiều khổ hộp từ tấm carton nguyên. Máy **chỉ cắt hàng loạt, đúng 2 giai đoạn**:

1. Cắt **ngang xuyên suốt tấm** → các **dải / hàng** cùng chiều dài.
2. Cắt **dọc từng dải** → từng tấm hộp (không cắt xuyên các dải khác).

Trong một dải mọi tấm phải cùng chiều dài (sau khi xoay 90° nếu được phép). Layout nested / free-form 2D **không hợp lệ**.

Thuật toán nằm ở [`cutting_stock.py`](cutting_stock.py) (`suggest_plans`). Flask gọi hàm đó; trình duyệt chỉ vẽ sơ đồ.

Repo: https://github.com/baonguyen-de/baitoan-toiuu

## Yêu cầu

- Python **3.10+**
- pip

Không cần Node.js để chạy web.

## Cài đặt

```bash
git clone git@github.com:baonguyen-de/baitoan-toiuu.git
cd baitoan-toiuu

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt`: `flask>=3.0`.

## Chạy web

```bash
python app.py
```

Mở **http://127.0.0.1:5000** (debug Flask tự reload khi sửa `cutting_stock.py` — F5 trình duyệt).

Phải mở qua Flask. UI gọi `POST /api/suggest`; `npm run dev` (Vite :5173) **không** proxy API nên không chạy được solver.

## Deploy Vercel

Solver vẫn là Python (`cutting_stock.py` qua Flask). Vercel phục vụ HTML/JS/CSS từ CDN (`public/`, tạo lúc build) và chạy API trong một function Flask.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/baonguyen-de/baitoan-toiuu)

1. Push repo lên GitHub (đã có `vercel.json`).
2. Mở [vercel.com/new](https://vercel.com/new) → **Import** repo.
3. Framework Preset: **Flask** — đã ghi trong `vercel.json`. Nếu dashboard nhận nhầm **Vite** (vì `package.json`), đổi lại thành Flask.
4. Deploy. Không cần biến môi trường.

Hoặc CLI (đã `npx vercel login`):

```bash
npx vercel --prod
```

`vercel.json` cài Python từ `requirements.txt`, chạy `python scripts/sync_vercel_public.py` (copy `index.html` + UI trong `src/` → `public/`), rồi deploy `app.py`.

Hobby: thời gian chạy function mặc định ngắn (~10–30s). Đơn vài loại khổ, vài trăm tấm vẫn kịp. Đơn rất lớn trên Hobby có thể timeout — tăng `functions.app.py.maxDuration` (Pro).

Local vẫn `python app.py`. Không dùng `npm run dev` trên Vercel.

### Dùng giao diện

1. Trang tự load mẫu **Đơn chuẩn** (`chuan`) và gọi gợi ý cắt.
2. Sửa **Rộng × Dài** tấm nguyên và bảng **Các tấm cần cắt** (kí hiệu, rộng, dài, SL).
3. Tích **Cho phép các tấm cắt xoay 90°** nếu không kỵ hướng sóng.
4. **Thêm tấm cắt** / × để thêm-xóa dòng. SL phải nguyên dương.
5. **Bắt đầu cắt** để tính lại. Cách đầu tiên là tốt nhất (`score_plan`).
6. Chọn thẻ cách cắt bên phải để xem sơ đồ + hướng dẫn nhát.

Đơn vị (cm, mm…) tự chọn, miễn nhất quán.

**Mẫu ví dụ** (`src/examples.js`):

- Chip nổi bật: Ghép dư hàng, Ít tờ hơn, Gần lấp kín, Trộn không rác, Đơn xưởng, Xoay ghép hàng — các đơn để so sánh trộn hàng / tách khổ / xoay tấm.
- Dropdown **Mẫu cơ bản**: Đơn chuẩn, Lấp kín, Trộn cùng dài, Phải xoay, Cấm xoay, Nhiều tấm, Khổ quá to, kích thước lẻ, …

`GET /api/sample` ghi đè kích thước mẫu **Đơn chuẩn** bằng `SAMPLE` Python (A/B/C trên tấm 100×200).

### Sơ đồ

Mỗi tấm có hai khung:

- **Toàn tấm** — layout cả tờ, kể cả phần dư dưới.
- **Phóng vùng cắt** — zoom phần đã xếp, có trục Rộng / Dài.

Lăn chuột zoom, kéo để xem, nút ± / Vừa khung. Màu theo kí hiệu khổ; gạch chéo đậm = scrap (không tái sử dụng), gạch nhạt = remnant (tái sử dụng). Đường đỏ = cắt ngang, xanh = cắt dọc.

## Kiểm thử

Solver Python (bắt buộc):

```bash
python -m unittest test_cutting_stock.py -v
```

Mỗi plan trả về phải qua `assert_valid_plan` (thẳng hàng, cùng chiều dài dải, không tràn mép).

Port JS (không phục vụ web), nếu có Node:

```bash
npm test
```

## API

Flask phục vụ UI và API. Không CORS — gọi từ cùng origin `:5000`.

| Method | Đường dẫn | Việc |
|---|---|---|
| `GET` | `/` | `index.html` |
| `GET` | `/src/<file>` | JS/CSS tĩnh |
| `GET` | `/api/sample` | `SAMPLE` Python |
| `POST` | `/api/suggest` | `suggest_plans` |

Ví dụ:

```bash
curl -s http://127.0.0.1:5000/api/sample

curl -s -X POST http://127.0.0.1:5000/api/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "sheet": {"width": 100, "height": 200},
    "items": [
      {"name": "A", "width": 10, "height": 20, "quantity": 10},
      {"name": "B", "width": 5, "height": 10, "quantity": 15},
      {"name": "C", "width": 2, "height": 3, "quantity": 20}
    ],
    "allowRotation": true,
    "maxPlans": 6
  }'
```

Body `POST /api/suggest`:

| Field | Mặc định | Nghĩa |
|---|---|---|
| `sheet` | `{}` | `{width, height}` |
| `items` | `[]` | `[{name, width, height, quantity}, ...]` |
| `allowRotation` | `true` | xoay khổ 90° |
| `maxPlans` | `6` | số cách trả về |

Lỗi nhập: `{ ok: false, errors, plans: [] }`.

Không xếp được: `{ ok: true, errors: [], plans: [], demand, sheet, message }`.

Thành công: `{ ok: true, errors: [], plans, demand, sheet }`. `plans[0]` tốt nhất (`best: true`).

Mỗi plan có `sheets` (toạ độ dải/tấm), `cuts` (thứ tự cắt), `metrics`, `desc`, `mix`, `swapped`. Chi tiết field: [`THUAT_TOAN.md`](THUAT_TOAN.md) §8.

Gọi trực tiếp từ Python:

```python
from cutting_stock import SAMPLE, suggest_plans

result = suggest_plans(SAMPLE["sheet"], SAMPLE["items"], allow_rotation=True)
print(result["plans"][0]["metrics"])
```

## Cấu trúc

| File | Việc |
|---|---|
| `cutting_stock.py` | Solver. Điểm vào: `suggest_plans` |
| `app.py` | Flask: UI + `/api/suggest` |
| `index.html` | Form + khung kết quả |
| `src/main.js` | Gọi API, chọn mẫu, chọn cách cắt |
| `src/examples.js` | Mẫu ví dụ trên UI |
| `src/render.js` | Sơ đồ SVG, metrics, hướng dẫn cắt |
| `src/style.css` | Giao diện |
| `src/solver.js` | Port JS — **không** chạy trên web |
| `test_cutting_stock.py` | Test Python |
| `THUAT_TOAN.md` | Từng hàm (xoay, knapsack, mix, pack, score) |
| `AGENTS.md` | Quy ước khi sửa thuật toán |
| `vercel.json` | Deploy Flask lên Vercel (không dùng Vite) |
| `scripts/sync_vercel_public.py` | Copy UI vào `public/` lúc build Vercel |

`.gitignore` loại `.venv/`, `node_modules/`, `dist/`, `public/`, `__pycache__/`, IDE.

## Mục tiêu xếp hạng

`score_plan` — **nhỏ hơn là tốt hơn**, theo thứ tự:

1. Ít khổ chưa xếp (`unpacked`)
2. Ít tấm nguyên
3. Ít vụn trong hàng (`scrapArea` — không tái sử dụng)
4. Ít dải / hàng ngang
5. Ít nhát cắt
6. Ít tổng hao phí (`wasteArea`)

Phần dư dưới cùng tấm (remnant) tái sử dụng được — tốt hơn vụn kẹt trong hàng.

Ba kiểu xếp dải: tách khổ (`mix=False`), trộn hàng cùng chiều dài (`mix=True`), xếp cùng khổ rồi trộn phần dư (`mix="backfill"`).

Chi tiết hàm: [`THUAT_TOAN.md`](THUAT_TOAN.md).
