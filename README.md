# Fundamentals_Computer_Vision

Bài học nền tảng Computer Vision về **local feature detection & description** — SIFT & ORB — dưới 3 dạng:

| Nội dung | Đường dẫn |
|---|---|
| 🌐 **Trang giải thích tương tác** (khuyến nghị) | [`sift-orb-html/index.html`](sift-orb-html/index.html) — mở trực tiếp, không cần server |
| 🔎 **Trang Harris Corner Detector** | [`sift-orb-html/harris.html`](sift-orb-html/harris.html) — E(u,v), structure tensor, R = det − κ·trace² |
| 🌿 **Trang Canny Edge Detector** | [`sift-orb-html/canny.html`](sift-orb-html/canny.html) — 3 tiêu chí Canny, NMS, ngưỡng kép + hysteresis |
| 📊 Bộ slide PowerPoint 23 trang | [`SIFT_ORB_Computer_Vision.pptx`](SIFT_ORB_Computer_Vision.pptx) |
| 🐍 Script sinh toàn bộ hình minh hoạ + số liệu | [`scripts/generate_assets.py`](scripts/generate_assets.py) (OpenCV 5 + matplotlib) |

## Trang SIFT & ORB có gì

- **Pipeline tổng quan** của từng giải thuật, bấm sâu vào chi tiết từng bước: DoG thay LoG, keypoint localization (Taylor + Hessian), orientation assignment, descriptor 128-D · FAST, pyramid + Harris, intensity centroid, rBRIEF 256-bit.
- **11 widget tính lại đúng thuật toán bằng JavaScript** ngay trong trình duyệt: pyramid explorer, orientation walkthrough, tensor viewer Harris (M, λ₁, λ₂, R số thật), mô phỏng greedy rBRIEF, demo Hamming trên 256 bit thật…
- **Giải thích con số 205,590 test** của rBRIEF: C(676,2) = 228,150 cặp ô 5×5 − 22,560 cặp chồng lấn (kiểm chứng brute-force trong `verify_205590()`).
- **Số liệu "thật"** (kernel, Hessian, descriptor, bit rBRIEF…) do OpenCV tính trên ảnh mẫu, xuất ra `sift-orb-html/js/real_data.js`.
- Bảng so sánh SIFT vs ORB trên cùng một ảnh + benchmark đo trực tiếp.

## Hai trang detector « nguyên thuỷ » (Harris & Canny)

- `sift-orb-html/harris.html` — 4 widget: thăm dò E(u,v) thật trên ảnh (so xấp xỉ Taylor), tensor viewer 7×7 (M, λ₁, λ₂, R, ellipse), mặt phẳng eigenvalue của ~24,000 pixel với biên R = 0 theo κ, pipeline đầy đủ (R-map + ngưỡng + NMS) — kèm chứng minh R &gt; 0 ⟺ λ₂/λ₁ ∈ (t*, 1/t*).
- `sift-orb-html/canny.html` — 5 widget: cạnh 1D + nhiễu (SNR đo trực tiếp, sai phân thô vs đạo hàm Gaussian), khám phá từng giai đoạn 2D, soi NMS 4-sector tới từng láng giềng, ngưỡng kép + hysteresis (BFS hoạt hình), pipeline đầy đủ.
- Số đối chiếu OpenCV sinh bởi `scripts/generate_hc_assets.py` → `sift-orb-html/js/hc_data.js`; pipeline Python chép y hệt pipeline JS — bảo chứng bằng `scripts/qa_hc_pyexport.py` + `scripts/qa_hc_node.js` (JS ≡ Python tới 1e-15, đếm cạnh/góc khớp chính xác).

## Chạy lại hình minh hoạ & số liệu

```bash
python3 -m venv .venv
.venv/bin/pip install numpy opencv-python matplotlib
.venv/bin/python scripts/generate_assets.py
```

Script ghi hình vào `assets/` (PNG) + `sift-orb-html/img/` (JPG) và `sift-orb-html/js/real_data.js`.

## Xem online

Bật GitHub Pages (*Settings → Pages → Deploy from branch: main / root*) → `https://benbunbo.github.io/Fundamentals_Computer_Vision/`. Trang SIFT & ORB tự chứa đủ mọi thứ (không fetch ngoài), nên chạy được cả qua `file://`.
