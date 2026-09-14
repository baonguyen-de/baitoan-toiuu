# Cắt tấm carton — guillotine 2 giai đoạn

Gợi ý cách cắt nhiều khổ hộp từ tấm carton nguyên. Máy **chỉ cắt hàng loạt, đúng 2 giai đoạn**:

1. Cắt **ngang xuyên suốt tấm** → các **dải** cùng chiều cao.
2. Cắt **dọc từng dải** → từng tấm hộp.

Trong một dải mọi tấm phải cùng chiều cao (sau khi xoay 90° nếu được phép). Layout nested / free-form 2D **không hợp lệ**.

Thuật toán nằm ở [`cutting_stock.py`](cutting_stock.py) (`suggest_plans`). Web Flask gọi hàm đó rồi vẽ sơ đồ trên trình duyệt.

## Yêu cầu

- Python **3.10+**
- pip

Không cần Node.js để chạy web.

## Cài đặt

```bash
git clone <url-repo>
cd baitoan-toiuu

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Chạy web

```bash
python app.py
```

Mở **http://127.0.0.1:5000**

- Trang tự load đơn mẫu và gợi ý cách cắt.
- Sửa khổ tấm / danh sách khổ, bấm **Gợi ý cách cắt**.
- **Đơn mẫu** để reset dữ liệu mẫu.
- Cách đầu tiên trong danh sách là tốt nhất (theo `score_plan`).
- Flask debug tự reload khi sửa `cutting_stock.py` — F5 trình duyệt.

Đơn vị (cm, mm…) tự chọn, miễn nhất quán. Số lượng khổ phải là số nguyên dương.

### Đơn mẫu

| | Rộng | Cao | SL |
|---|---|---|---|
| Tấm nguyên | 100 | 200 | không giới hạn |
| Khổ `10×20` | 10 | 20 | 10 |
| Khổ `5×10` | 5 | 10 | 15 |
| Khổ `2×3` | 2 | 3 | 20 |

## Kiểm thử

```bash
python -m unittest test_cutting_stock.py -v
```

Mỗi plan trả về phải qua `assert_valid_plan` (thẳng hàng, cùng chiều cao dải, không tràn mép).

## API

Server Flask phục vụ UI và hai endpoint:

| Method | Đường dẫn | Việc |
|---|---|---|
| `GET` | `/` | Giao diện |
| `GET` | `/api/sample` | Đơn mẫu `SAMPLE` |
| `POST` | `/api/suggest` | Gọi `suggest_plans` |

Ví dụ:

```bash
curl -s http://127.0.0.1:5000/api/sample

curl -s -X POST http://127.0.0.1:5000/api/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "sheet": {"width": 100, "height": 200},
    "items": [
      {"name": "10×20", "width": 10, "height": 20, "quantity": 10},
      {"name": "5×10", "width": 5, "height": 10, "quantity": 15},
      {"name": "2×3", "width": 2, "height": 3, "quantity": 20}
    ],
    "allowRotation": true,
    "maxPlans": 6
  }'
```

Body `POST /api/suggest`:

```json
{
  "sheet": { "width": 100, "height": 200 },
  "items": [{ "name": "10×20", "width": 10, "height": 20, "quantity": 10 }],
  "allowRotation": true,
  "maxPlans": 6
}
```

Trả về `{ ok, errors, plans, demand, sheet }`. `plans[0]` là cách tốt nhất. Mỗi plan có `sheets` (toạ độ dải/tấm), `cuts` (thứ tự cắt), `metrics` (hao phí, số tấm, số nhát).

Gọi trực tiếp từ Python:

```python
from cutting_stock import SAMPLE, suggest_plans

result = suggest_plans(SAMPLE["sheet"], SAMPLE["items"], allow_rotation=True)
print(result["plans"][0]["metrics"])
```

## Cấu trúc

| File | Việc |
|---|---|
| `cutting_stock.py` | Thuật toán. Điểm vào: `suggest_plans` |
| `THUAT_TOAN.md` | Mô tả từng hàm (xoay, knapsack dải, mix, xếp tấm, chấm điểm) |
| `app.py` | Flask: UI + `/api/suggest` |
| `index.html`, `src/` | Giao diện (gọi API Python) |
| `test_cutting_stock.py` | Test bắt buộc |
| `AGENTS.md` | Quy ước cho agent khi sửa thuật toán |

## Mục tiêu xếp hạng

`score_plan` — **nhỏ hơn là tốt hơn**, theo thứ tự:

1. Ít khổ chưa xếp
2. Ít tấm nguyên
3. Ít vụn trong hàng (`scrapArea`)
4. Ít dải
5. Ít nhát cắt
6. Ít tổng hao phí (`wasteArea`)

Phần dư dưới cùng tấm (remnant) tái sử dụng được — tốt hơn vụn kẹt trong hàng.

Ba kiểu xếp dải: tách khổ (`mix=False`), trộn hàng cùng chiều cao (`mix=True`), xếp cùng khổ rồi trộn phần dư (`mix="backfill"`).

Chi tiết hàm: [`THUAT_TOAN.md`](THUAT_TOAN.md).
