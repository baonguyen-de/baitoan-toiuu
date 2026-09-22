# Hướng dẫn sử dụng — Bài toán tối ưu cắt

**Version:** version_2

Phần mềm gợi ý **cách cắt nhiều khổ hộp từ tấm carton nguyên**, theo đúng máy xưởng: **cắt ngang trước, rồi cắt dọc từng hàng**.

Không cần hiểu thuật toán. Chỉ cần nhập kích thước tấm nguyên + đơn hàng, nhấn **Bắt đầu cắt**, rồi chọn phương án để xem sơ đồ và thứ tự nhát.

---

## 1. Phần mềm làm gì

Bạn có:

- Tấm carton nguyên (cùng một khổ, dùng bao nhiêu tờ cũng được)
- Danh sách tấm hộp cần cắt (kí hiệu, rộng, dài, số lượng)

Phần mềm trả về vài **cách cắt**. Cách đầu tiên (nhãn **Cách tối ưu nhất**) thường là lựa chọn nên dùng: đủ đơn nhất, ít tờ nhất, hiệu suất cao nhất, ít scrap kẹt trong hàng nhất.

Hai chỉ số nổi trên kết quả (2 chữ số thập phân):

- **Hiệu suất sử dụng** = diện tích BTP đã xếp / diện tích tấm nguyên **đầy đủ** (gồm trim)
- **Tỷ lệ hao hụt** = phần không thành BTP / diện tích tấm nguyên đầy đủ

Máy **không** cắt kiểu xếp lộn xộn. Đúng 3 bước:

1. **Xén biên máy (Trim)** — trừ trước, không phải phần dư sau khi xếp.
2. Cắt **ngang xuyên suốt khổ hữu dụng** → tách thành các **hàng** (dải) cùng chiều dài.
3. Cắt **dọc từng hàng** → ra từng tấm hộp. Không cắt dọc xuyên sang hàng khác.

Trong một hàng, mọi tấm phải **cùng chiều dài**. Nếu lệch hàng, nhát ngang sẽ hư hộp.

Ô **Rộng** / **Dài** của tấm nguyên luôn giữ đúng số bạn gõ. Thuật toán không đổi chỗ nhãn.

---

## 2. Dùng giao diện — từng bước

Mở trang web của phần mềm (máy bạn: chạy `python app.py` rồi vào http://127.0.0.1:5000).

### Bước 1 — Tấm nguyên

Nhập **Rộng × Dài** của tờ carton bán thành phẩm. **Rộng** = cạnh ngang, **Dài** = cạnh kia — đúng số vừa gõ, không bị đổi chỗ.

Đơn vị tự chọn (cm, mm…), **miễn dùng cùng đơn vị** cho tấm nguyên, trim và mọi tấm cắt.

### Bước 2 — Thông số máy xén (Trim)

Trim là **biên xén bắt buộc của máy**, khai báo trước rồi trừ ra, rồi mới xếp BTP vào **khổ hữu dụng**.

- Mục đích: tránh nhăn / cấn mép BTP, giữ mép thành phẩm ổn định.
- Máy khác nhau trim khác nhau; có máy biên lớn. Đây là **ràng buộc máy**, không phải kết quả xếp.
- **Không** lấy khe còn lại sau khi nhét BTP rồi gọi là Trim.

Nhập **Trái / Phải / Trên / Dưới** (mặc định 0). Dòng **Khổ hữu dụng** = Rộng − trái − phải, Dài − trên − dưới.

Sau khi xếp, chỗ trống **trong khổ hữu dụng** tách 2 loại, khác Trim:

| Loại | Nghĩa |
|---|---|
| **Trim máy** | Biên xén bắt buộc, trừ trước |
| **Scrap** | Vụn trong hàng, không tái sử dụng |
| **Remnant** | Dải nguyên còn lại, tái sử dụng được |

### Bước 3 — Các tấm cần cắt

Mỗi dòng một khổ hộp:

| Cột | Ý nghĩa |
|---|---|
| **Kí hiệu** | Tên gọi (A, B, nắp, thân…). Để trống thì phần mềm tự ghi `rộng×dài`. |
| **Rộng** | Cạnh ngang khi đặt không xoay |
| **Dài** | Cạnh kia (trên sơ đồ là chiều từ trên xuống) |
| **SL** | Số lượng cần cắt — phải là số nguyên dương |

- **Thêm tấm cắt**: thêm dòng
- **×**: xóa dòng

### Bước 4 — Hai loại xoay (tách riêng)

- **Cho phép các tấm cắt xoay 90°** (`allowPieceRotation`) — xoay từng BTP. Ô vẽ có dấu ↻; cột đơn hàng **không** đổi Rộng/Dài.
- **Cho phép xoay hướng cắt tấm nguyên** (`allowSheetRotation`) — thuật toán được thử đổi cạnh cắt ngang của tờ. Mặc định **tắt** (tránh bug V1 đổi 2200×3000 thành 3000×2200). Khi dùng, thẻ ghi **xoay hướng cắt tấm nguyên**; tờ vẫn Rộng × Dài như đã nhập.

Tắt xoay BTP khi giấy có hướng sóng bắt buộc.

### Bước 5 — Bắt đầu cắt

Nhấn **Bắt đầu cắt**. Bên phải hiện các thẻ phương án.

Có thể chọn **Mẫu ví dụ** (chip hoặc dropdown) để xem đơn mẫu rồi sửa lại cho đơn thật.

---

## 3. Đọc kết quả

### Thẻ cách cắt (bên phải, phía trên)

Mỗi thẻ là một phương án. Cách **1** có nhãn **Cách tối ưu nhất**. Bấm thẻ để xem sơ đồ.

Trên thẻ bạn thấy:

- **Hiệu suất sử dụng** và **Tỷ lệ hao hụt** (2 chữ số thập phân + %)
- Số **tấm nguyên** dùng và số **hàng** cắt
- Kiểu xếp: **tách khổ** / **trộn hàng** / **dư hàng trộn** (và có thể **xoay hướng cắt tấm nguyên**)
- **Trim máy** / **Scrap** / **Remnant** — ba loại diện tích khác nhau
- **Nhát cắt** — số đường máy phải cắt

Nếu thẻ có cảnh báo **Chưa cắt hết**: một số khổ không vừa tấm (kể cả khi xoay). Cần tấm nguyên lớn hơn, hoặc bật xoay, hoặc bỏ khổ đó.

### Chỉ số phía dưới thẻ

| Chỉ số | Đọc thế nào |
|---|---|
| Hiệu suất sử dụng | packed / (số tờ × Rộng × Dài), gồm trim |
| Tỷ lệ hao hụt | 1 − hiệu suất |
| Trim máy | Biên xén bắt buộc, trừ trước khi xếp |
| Scrap | Vụn kẹt **trong hàng** — không tái sử dụng |
| Remnant | Dải nguyên còn lại — tái sử dụng được |
| Số lượng tấm nguyên dùng | Cần lấy bao nhiêu tờ carton |
| Số hàng ngang cắt | Máy cắt ngang bao nhiêu dải |
| Khổ hữu dụng | Tấm sau khi trừ trim |
| Đã xếp | Số hộp xếp được / số hộp trên đơn |

**Nên ưu tiên:** đủ đơn → ít tờ → hiệu suất cao (hao hụt thấp) → ít scrap → remnant lớn → ít hàng → ít nhát.

### Sơ đồ

Mỗi tờ nguyên có **hai khung**:

1. **Toàn tấm** — nhìn cả tờ, kể cả phần dư dưới.
2. **Phóng vùng cắt** — zoom phần đã xếp, có trục **Rộng** (ngang) và **Dài** (dọc).

Cách xem:

- Lăn chuột: phóng to / thu nhỏ
- Kéo: di chuyển khung nhìn
- Nút **−** / **+** / **Vừa khung**

Màu sắc theo kí hiệu khổ. Ký hiệu **↻** trên tấm = khổ đó đã xoay 90°.

| Trên sơ đồ | Nghĩa |
|---|---|
| Ô màu đặc | Tấm hộp đã xếp |
| Gạch **chéo chéo (xanh xám)** | Trim máy — biên xén, không nhầm scrap |
| Gạch chéo **đậm** | Scrap trong hàng — không tái sử dụng |
| Gạch chéo **nhạt** | Remnant — tái sử dụng được |
| Đường **đỏ** | Cắt ngang xuyên khổ hữu dụng |
| Đường **xanh** | Cắt dọc trong một hàng |

### Hướng dẫn thứ tự cắt

Làm đúng thứ tự này trên máy:

1. **Xén biên máy** — trim trái / phải / trên / dưới như đã khai.
2. **Ngang** — cắt xuyên khổ hữu dụng tại các vị trí `y` (tách thành hàng).
3. **Dọc** — lấy từng hàng, cắt tại các vị trí `x` (ra từng hộp). Không cắt xuyên hàng khác.

`Tấm 1`, `Tấm 2`… là từng tờ carton nguyên.

---

## 4. Ba kiểu xếp hàng

Phần mềm tự thử nhiều kiểu, rồi chọn kiểu tốt. Nhãn trên thẻ:

| Nhãn | Máy cắt thế nào | Khi nào hay gặp |
|---|---|---|
| **Tách khổ** | Mỗi hàng chỉ một loại hộp | Cắt đồng loạt cùng size, dễ làm |
| **Trộn hàng** | Trong một hàng trộn vài khổ **cùng chiều dài** | Lấp kín ngang, giảm rác |
| **Dư hàng trộn** | Xếp cùng khổ trước, khe ngang còn lại mới nhét khổ khác cùng dài | Vừa dễ cắt, vừa tận dụng khe |
| **Xoay hướng cắt tấm nguyên** | Thử cạnh cắt ngang khác của tờ (tờ vẫn Rộng × Dài như nhập) | Đôi khi ghép hàng kín hơn |

Chỉ trộn được khi các hộp **cùng chiều dài hàng**. Xoay 90° đôi khi giúp hai khổ khác nhau thành cùng chiều dài.

---

## 5. Thuật ngữ

Giải thích đúng như chữ trên màn hình. Trong ngoặc là tên hay gặp ở xưởng / trên sơ đồ.

**Tấm nguyên / bán thành phẩm**  
Tờ carton mua sẵn, chưa cắt hộp. Mọi tờ cùng kích thước.

**Tấm cắt / khổ / hộp**  
Miếng cần lấy ra từ tấm nguyên (một dòng trên bảng đơn).

**Rộng**  
Cạnh ngang trên sơ đồ (trục trái → phải).

**Dài**  
Cạnh kia, trên sơ đồ là từ trên xuống. Không gọi là “cao”.

**SL**  
Số lượng tấm cắt của khổ đó.

**Kí hiệu**  
Tên ngắn để nhận khổ trên sơ đồ (A, B, nắp…).

**Guillotine / cắt 2 giai đoạn / NGANG RỒI DỌC**  
Quy tắc máy: cắt xuyên suốt theo một hướng trước (ngang), xong mới cắt hướng kia trên từng hàng. Không cắt zíc zắc, không xếp lệch hàng.

**Hàng / dải**  
Một băng ngang trên tấm, mọi hộp trong đó cùng chiều dài. Máy cắt ngang để tách hàng, rồi cắt dọc hàng đó.

**Nhát cắt**  
Một đường máy phải cắt (ngang hoặc dọc). Ít nhát = làm nhanh hơn.

**Xoay 90° (tấm cắt)**  
Đổi chỗ rộng và dài của hộp khi đặt lên hàng. Dùng khi không kỵ hướng sóng.

**Xoay hướng cắt tấm nguyên**  
Thuật toán thử đổi cạnh cắt ngang của tờ. Không đổi ô nhập Rộng/Dài, không đổi tên trục. Thẻ ghi rõ khi dùng.

**Trim / biên xén máy**  
Phần mép bắt buộc máy phải xén **trước khi xếp**. Không phải khe còn lại sau packing.

**Hướng sóng**  
Hướng gân giấy carton. Nhiều hộp bắt buộc sóng chạy dọc hoặc ngang nhất định — lúc đó **tắt** xoay.

**Cách cắt / phương án**  
Một layout hoàn chỉnh: dùng bao nhiêu tờ, hàng nào, hộp nào nằm đâu, cắt lúc nào.

**Cách tối ưu nhất**  
Phương án phần mềm chấm điểm cao nhất trong các gợi ý (không phải “đẹp nhất”). Thứ tự ưu tiên: đủ đơn → ít tờ → ít rác trong hàng → ít hàng → ít nhát → ít tổng hao phí.

**Rác / scrap / diện tích không thể tái sử dụng**  
Khe vụn **nằm trong hàng**, cạnh các hộp. Quá hẹp hoặc kẹt giữa hàng nên **không** lấy ra làm tấm khác. Càng ít càng tốt.

**Dư / remnant / diện tích dư tái sử dụng**  
Phần **cả băng phía dưới tờ**, chưa bị cắt vụn. Còn nguyên khổ, để đơn sau.

**Tổng phần diện tích dư / waste**  
Mọi chỗ không thành hộp = rác trong hàng + phần dư dưới tờ.

**Chưa cắt hết / unpacked**  
Khổ trên đơn không xếp được vào tấm (thường vì lớn hơn tờ, kể cả khi xoay).

**Tách khổ**  
Mỗi hàng một loại hộp.

**Trộn hàng**  
Nhiều loại hộp chung một hàng, miễn cùng chiều dài.

**Dư hàng trộn**  
Hàng chủ yếu một loại; khe ngang còn lại mới nhét loại khác cùng dài.

**Toàn tấm**  
Sơ đồ cả tờ carton.

**Phóng vùng cắt**  
Sơ đồ zoom phần đã xếp hộp, có thước Rộng / Dài.

**Đã xếp**  
`số hộp vẽ được trên sơ đồ / số hộp trên đơn`. Đủ đơn thì hai số bằng nhau.

---

## 6. Lưu ý nhanh

- Đơn vị đo phải **thống nhất** trong một lần tính (đừng trộn cm với mm).
- SL phải là số nguyên (3 tấm, không phải 3.5).
- Khổ lớn hơn tấm nguyên (kể cả xoay) → không có sơ đồ, có thông báo rõ.
- **Scrap ít** quan trọng hơn **remnant lớn**: remnant còn dùng, scrap thì bỏ. Trim là biên máy, không phải dư sau xếp.
- Trộn hàng tiết kiệm giấy hơn nhưng trên máy phải cắt **nhiều size trong cùng một hàng**. Nếu xưởng muốn cắt đồng loạt một size, chọn thẻ **tách khổ**.
- Mẫu ví dụ chỉ để thử phần mềm, không phải đơn sản xuất.

---

## 7. Mẫu ví dụ (nếu muốn thử)

Chip nổi bật (so sánh kiểu xếp):

| Mẫu | Để thấy gì |
|---|---|
| Đơn poster 2200×3000 | Trim trái/phải 25 mm; A 700 / B 800 / C 650 × 1000 SL3 — 1 tấm, hiệu suất 97,73%, hao hụt 2,27% |
| Ghép dư hàng | Trộn hai khổ cùng dài thì 1 tờ, tách khổ phải 2 tờ |
| Ít tờ hơn | Đôi khi tách khổ dùng ít tờ hơn trộn |
| Gần lấp kín / Trộn không rác | Lấp ngang, rác ≈ 0 |
| Đơn xưởng | Đơn nhiều khổ, gần thực tế |
| Xoay ghép hàng | Xoay hướng cắt tấm nguyên rồi trộn, rác giảm |

Dropdown **Mẫu cơ bản**: Đơn chuẩn, Lấp kín, Phải xoay, Cấm xoay, Khổ quá to, Kích thước lẻ, …

---

*Tài liệu cho người dùng cuối. Chi tiết thuật toán: `THUAT_TOAN.md`. Cài đặt / API: `README.md`.*
