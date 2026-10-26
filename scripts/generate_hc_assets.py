#!/usr/bin/env python3
# Sinh js/hc_data.js — số tham chiếu cho trang harris-canny.html.
# Pipeline Python đây là bản "chép y" của JS trong sift-orb-html/js/hc_widgets.js:
#   Harris : gradient sai phân trung tâm (không chia 2, giống IMG.gradAt) + cửa sổ box 7×7 + R = det − 0.04·trace²
#   Canny  : blur Gaussian r=ceil(3σ) chuẩn hoá (giống IMG.gaussKernel) → Sobel 3×3 → |∇I| L2 →
#            NMS 4-sector (định lượng góc 22.5°/67.5°, so theo hướng gradient, hoà toàns đối xứng) →
#            ngưỡng kép + hysteresis 8-láng giềng (bao đóng, không phụ thuộc thứ tự duyệt)
# Nhờ cùng một chuỗi phép tính (float32 lưu trữ + float64 tính toán) số Python ≡ số JS tới mức ~1e-4.
# Chạy: .venv/bin/python scripts/generate_hc_assets.py
import base64
import json
import math
import re
from collections import deque
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "sift-orb-html"

W_TARGET = 640          # IMG.loadSampleGray(640)
KAPPA = 0.04
BLOCK = 7               # bán kính 3
SIGMA_C = 1.4           # σ mặc định của pipeline Canny trên trang

# ---------------------------------------------------------------- ảnh mẫu
def load_sample_gray():
    """Giải mã đúng js/sample_data.js (base64) → xám 640px, float32, luma BT.601."""
    src = (SITE / "js" / "sample_data.js").read_text()
    b64 = re.search(r'base64,([A-Za-z0-9+/=]+)"', src).group(1)
    buf = np.frombuffer(base64.b64decode(b64), np.uint8)
    bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    h, w = bgr.shape[:2]
    scale = min(1.0, W_TARGET / w)
    if scale < 1.0:
        bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    b, g, r = [c.astype(np.float64) for c in cv2.split(bgr)]
    gray = (0.299 * r + 0.587 * g + 0.114 * b).astype(np.float32)  # float32 — như Float32Array của JS
    return gray

# ---------------------------------------------------------------- Harris (bản sao của JS)
def central_diff(gray):
    """Ix, Iy — y hệt IMG.gradAt: I(x+1)−I(x−1), KHÔNG chia 2, biên clamp."""
    g = gray.astype(np.float64)
    Ix = np.empty_like(g); Iy = np.empty_like(g)
    Ix[:, 1:-1] = g[:, 2:] - g[:, :-2]
    Ix[:, 0] = g[:, 1] - g[:, 0]; Ix[:, -1] = g[:, -1] - g[:, -2]
    Iy[1:-1, :] = g[2:, :] - g[:-2, :]
    Iy[0, :] = g[1, :] - g[0, :]; Iy[-1, :] = g[-1, :] - g[-2, :]
    return Ix, Iy

def harris_map(gray, block=BLOCK, kappa=KAPPA):
    h, w = gray.shape
    Ix, Iy = central_diff(gray)
    # JS: toạ độ đọc gradient bị clamp vào [1, w-2]×[1, h-2] trước khi lấy sai phân
    Ix = Ix[1:-1, 1:-1]; Iy = Iy[1:-1, 1:-1]
    Sxx = cv2.boxFilter(Ix * Ix, ddepth=-1, ksize=(block, block), borderType=cv2.BORDER_REPLICATE,
                        normalize=False)
    Syy = cv2.boxFilter(Iy * Iy, ddepth=-1, ksize=(block, block), borderType=cv2.BORDER_REPLICATE,
                        normalize=False)
    Sxy = cv2.boxFilter(Ix * Iy, ddepth=-1, ksize=(block, block), borderType=cv2.BORDER_REPLICATE,
                        normalize=False)
    det = Sxx * Syy - Sxy * Sxy
    trace = Sxx + Syy
    R = det - kappa * trace * trace
    # pad lại về kích thước gốc (JS chỉ tính trong lõi nhưng giá trị biên không dùng)
    full = np.zeros((h, w), np.float64)
    full[1:-1, 1:-1] = R
    return full, Ix, Iy

def nms_count(R, thresh):
    """Số pixel: R > thresh và là max 3×3 (so >= láng giềng)."""
    m = R > thresh
    mx = R.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0: continue
            s = np.roll(np.roll(mx, dy, 0), dx, 1)
            m &= R >= s - 1e-9
    return int(m.sum())

# ---------------------------------------------------------------- Canny (bản sao của JS)
def gauss_kernel(sigma):
    r = max(1, math.ceil(3 * sigma))
    k = np.exp(-np.arange(-r, r + 1, dtype=np.float64) ** 2 / (2 * sigma * sigma))
    return k / k.sum(), r

def gauss_blur(gray, sigma):
    k, _ = gauss_kernel(sigma)
    return cv2.sepFilter2D(gray.astype(np.float64), -1, k, k,
                           borderType=cv2.BORDER_REPLICATE)

def sobel3(blurred):
    gx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3, borderType=cv2.BORDER_REPLICATE)
    gy = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3, borderType=cv2.BORDER_REPLICATE)
    return gx, gy

def canny_nms(gx, gy, l2=True):
    mag = np.hypot(gx, gy) if l2 else np.abs(gx) + np.abs(gy)
    h, w = mag.shape
    keep = np.zeros((h, w), bool)
    m = mag
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            gxc, gyc = gx[y, x], gy[y, x]
            a = m[y, x]
            if a == 0: continue
            ang = math.degrees(math.atan2(gyc, gxc)) % 180.0
            if ang < 22.5 or ang >= 157.5:
                n1, n2 = m[y, x - 1], m[y, x + 1]
            elif ang < 67.5:
                if gxc * gyc > 0: n1, n2 = m[y - 1, x - 1], m[y + 1, x + 1]
                else:             n1, n2 = m[y - 1, x + 1], m[y + 1, x - 1]
            elif ang < 112.5:
                n1, n2 = m[y - 1, x], m[y + 1, x]
            else:
                if gxc * gyc > 0: n1, n2 = m[y - 1, x + 1], m[y + 1, x - 1]
                else:             n1, n2 = m[y - 1, x - 1], m[y + 1, x + 1]
            # giữ nếu >= cả hai phía và > ít nhất một phía (hoà chỉ giữ 1)
            if a >= n1 and a >= n2 and (a > n1 or a > n2):
                keep[y, x] = True
    return mag, keep

def hysteresis(keep, mag, t_low, t_high):
    strong = keep & (mag >= t_high)
    weak = keep & (mag >= t_low) & (mag < t_high)
    edge = strong.copy()
    q = deque(zip(*np.nonzero(strong)))
    while q:
        y, x = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0: continue
                yy, xx = y + dy, x + dx
                if 0 <= yy < weak.shape[0] and 0 <= xx < weak.shape[1] and weak[yy, xx] and not edge[yy, xx]:
                    edge[yy, xx] = True
                    q.append((yy, xx))
    return strong, weak, edge

# ---------------------------------------------------------------- chạy
def main():
    gray = load_sample_gray()
    h, w = gray.shape
    print(f"sample: {w}x{h}")

    # ---- Harris (JS-identical) ----
    R, _, _ = harris_map(gray)
    ymax, xmax = np.unravel_index(np.argmax(R), R.shape)
    # ma trận M tại điểm max: tính trực tiếp như harrisParts — GRAY UPCAST float64
    # (JS đọc Float32Array ra double rồi mới trừ; nhân bản đúng ⇒ khớp tới 1e-15)
    g64 = gray.astype(np.float64)
    r0 = BLOCK // 2
    Sxx = Syy = Sxy = 0.0
    for dy in range(-r0, r0 + 1):
        for dx in range(-r0, r0 + 1):
            px = min(w - 2, max(1, int(xmax) + dx)); py = min(h - 2, max(1, int(ymax) + dy))
            gxc = g64[py, px + 1] - g64[py, px - 1]
            gyc = g64[py + 1, px] - g64[py - 1, px]
            Sxx += gxc * gxc; Syy += gyc * gyc; Sxy += gxc * gyc
    det = Sxx * Syy - Sxy * Sxy; trace = Sxx + Syy
    disc = math.sqrt(max(0.0, trace * trace / 4 - det))
    lam1, lam2 = trace / 2 + disc, trace / 2 - disc
    Rmax = float(R.max())
    thr1pct = 0.01 * Rmax
    n_before = int((R > thr1pct).sum())
    n_nms = nms_count(R, thr1pct)

    # ---- OpenCV cornerHarris (Sobel-based) để đối chiếu bậc độ lớn ----
    Rcv = cv2.cornerHarris(gray, blockSize=7, ksize=3, k=KAPPA)
    cv_max = float(Rcv.max())
    cv_n = nms_count(Rcv, 0.01 * cv_max)

    # ---- Canny (JS-identical) ----
    blurred = gauss_blur(gray, SIGMA_C)
    gx, gy = sobel3(blurred)
    mag, keep = canny_nms(gx, gy, l2=True)
    qs = np.percentile(keep.nonzero()[0] * 0 + mag[keep], [50, 90, 95, 99]) if keep.any() else [0]
    print(f"mag trên NMS: p50={qs[0]:.1f} p90={qs[1]:.1f} p95={qs[2]:.1f} p99={qs[3]:.1f}, max={mag.max():.1f}")
    T_HIGH, T_LOW = 110.0, 55.0
    strong, weak, edge = hysteresis(keep, mag, T_LOW, T_HIGH)
    print(f"JS-pipeline: keep={int(keep.sum())} strong={int(strong.sum())} weak={int(weak.sum())} edge={int(edge.sum())}")

    blurred_cv = cv2.GaussianBlur(gray, (11, 11), SIGMA_C, borderType=cv2.BORDER_REPLICATE)
    blurred_u8 = np.clip(blurred_cv, 0, 255).astype(np.uint8)
    edge_cv = cv2.Canny(blurred_u8, T_LOW, T_HIGH, apertureSize=3, L2gradient=True)
    print(f"cv2.Canny cùng tham số: {int((edge_cv > 0).sum())} điểm")

    data = {
        "meta": {"sample": f"{w}x{h}", "opencv": cv2.__version__, "note": "sinh bởi scripts/generate_hc_assets.py"},
        "harris": {
            "x": int(xmax), "y": int(ymax), "block": BLOCK, "kappa": KAPPA,
            "M": [[Sxx, Sxy], [Sxy, Syy]], "det": det, "trace": trace,
            "lam1": lam1, "lam2": lam2, "R": det - KAPPA * trace * trace, "Rmax": Rmax,
            "thr1pct": thr1pct, "nAbove": n_before, "nmsN": n_nms,
            "cvNmsN": cv_n, "cvRmax": cv_max,
        },
        "canny": {
            "sigma": SIGMA_C, "tHigh": T_HIGH, "tLow": T_LOW,
            "nKeep": int(keep.sum()), "nStrong": int(strong.sum()), "nWeak": int(weak.sum()),
            "nEdge": int(edge.sum()), "magMax": float(mag.max()),
            "cvEdge": int((edge_cv > 0).sum()),
        },
    }
    out = SITE / "js" / "hc_data.js"
    out.write_text("// Số tham chiếu OpenCV + pipeline Python trùng khớp JS — sinh bởi scripts/generate_hc_assets.py\n"
                   "const REAL_HC = " + json.dumps(data, ensure_ascii=False, indent=2, default=float) + ";\n")
    print("wrote", out)

if __name__ == "__main__":
    main()
