# Fundamentals_Computer_Vision

Bài học nền tảng Computer Vision về **local feature detection & description** — SIFT & ORB — dưới 3 dạng:

| Nội dung | Đường dẫn |
|---|---|
| 🌐 **Trang giải thích tương tác** (khuyến nghị) | [`sift-orb-html/index.html`](sift-orb-html/index.html) — mở trực tiếp, không cần server |
| 📊 Bộ slide PowerPoint 23 trang | [`SIFT_ORB_Computer_Vision.pptx`](SIFT_ORB_Computer_Vision.pptx) |
| 🐍 Script sinh toàn bộ hình minh hoạ + số liệu | [`scripts/generate_assets.py`](scripts/generate_assets.py) (OpenCV 5 + matplotlib) |

## Trang SIFT & ORB có gì

- **Pipeline tổng quan** của từng giải thuật, bấm sâu vào chi tiết từng bước: DoG thay LoG, keypoint localization (Taylor + Hessian), orientation assignment, descriptor 128-D · FAST, pyramid + Harris, intensity centroid, rBRIEF 256-bit.
- **11 widget tính lại đúng thuật toán bằng JavaScript** ngay trong trình duyệt: pyramid explorer, orientation walkthrough, tensor viewer Harris (M, λ₁, λ₂, R số thật), mô phỏng greedy rBRIEF, demo Hamming trên 256 bit thật…
- **Giải thích con số 205,590 test** của rBRIEF: C(676,2) = 228,150 cặp ô 5×5 − 22,560 cặp chồng lấn (kiểm chứng brute-force trong `verify_205590()`).
- **Số liệu "thật"** (kernel, Hessian, descriptor, bit rBRIEF…) do OpenCV tính trên ảnh mẫu, xuất ra `sift-orb-html/js/real_data.js`.
- Bảng so sánh SIFT vs ORB trên cùng một ảnh + benchmark đo trực tiếp.

## Chạy lại hình minh hoạ & số liệu

```bash
python3 -m venv .venv
.venv/bin/pip install numpy opencv-python matplotlib
.venv/bin/python scripts/generate_assets.py
```

Script ghi hình vào `assets/` (PNG) + `sift-orb-html/img/` (JPG) và `sift-orb-html/js/real_data.js`.

## Xem online

Bật GitHub Pages (*Settings → Pages → Deploy from branch: main / root*) → `https://benbunbo.github.io/Fundamentals_Computer_Vision/`. Trang SIFT & ORB tự chứa đủ mọi thứ (không fetch ngoài), nên chạy được cả qua `file://`.
