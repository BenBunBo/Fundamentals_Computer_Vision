#!/usr/bin/env python3
# QA: xuất ảnh xám + kết quả pipeline Python để node test đối chiếu với JS thật.
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_hc_assets as g

out = {}
gray = g.load_sample_gray()
h, w = gray.shape
gray.tofile("/tmp/hc_gray.f32")
json.dump({"w": w, "h": h}, open("/tmp/hc_dims.json", "w"))

# ---- Harris: bản sao y của widget 4 (integral sums, gradient tại MỌI pixel biên clamp) ----
Ix, Iy = g.central_diff(gray)  # ≡ JS gradientMaps: full size, biên = hiệu 2 pixel mép
def integral(a):
    I = np.zeros((h + 1, w + 1))
    I[1:, 1:] = np.cumsum(np.cumsum(a, axis=0), axis=1)
    return I
Ixx, Iyy, Ixy = integral(Ix * Ix), integral(Iy * Iy), integral(Ix * Iy)
def isum(I, x0, y0, x1, y1):
    return I[y1 + 1, x1 + 1] - I[y0, x1 + 1] - I[y1 + 1, x0] + I[y0, x0]

BLOCK, KAPPA = 7, 0.04
r = BLOCK // 2
R = np.zeros((h, w))
for y in range(h):
    y0, y1 = max(0, y - r), min(h - 1, y + r)
    for x in range(w):
        x0, x1 = max(0, x - r), min(w - 1, x + r)
        Sxx = isum(Ixx, x0, y0, x1, y1)
        Syy = isum(Iyy, x0, y0, x1, y1)
        Sxy = isum(Ixy, x0, y0, x1, y1)
        R[y, x] = Sxx * Syy - Sxy * Sxy - KAPPA * (Sxx + Syy) ** 2
ymax, xmax = np.unravel_index(np.argmax(R), R.shape)

Sxx = Syy = Sxy = 0.0
g64 = gray.astype(np.float64)
for dy in range(-r, r + 1):
    for dx in range(-r, r + 1):
        px = min(w - 2, max(1, int(xmax) + dx)); py = min(h - 2, max(1, int(ymax) + dy))
        gxc = g64[py, px + 1] - g64[py, px - 1]
        gyc = g64[py + 1, px] - g64[py - 1, px]
        Sxx += gxc * gxc; Syy += gyc * gyc; Sxy += gxc * gyc
det = Sxx * Syy - Sxy * Sxy; trace = Sxx + Syy
disc = math.sqrt(max(0.0, trace * trace / 4 - det))

out["harris"] = {
    "x": int(xmax), "y": int(ymax),
    "M": [[Sxx, Sxy], [Sxy, Syy]], "det": det, "trace": trace,
    "lam1": trace / 2 + disc, "lam2": trace / 2 - disc,
    "R": det - KAPPA * trace * trace, "Rmax": float(R.max()),
}

# ---- Canny: cùng pipeline Python như generate_hc_assets.py ----
blur = g.gauss_blur(gray, 1.4)
gx, gy = g.sobel3(blur)
mag, keep = g.canny_nms(gx, gy, l2=True)
strong, weak, edge = g.hysteresis(keep, mag, 55.0, 110.0)
out["canny"] = {
    "magMax": float(mag.max()), "nKeep": int(keep.sum()),
    "nStrong": int(strong.sum()), "nWeak": int(weak.sum()), "nEdge": int(edge.sum()),
}
json.dump(out, open("/tmp/hc_py.json", "w"), indent=1, default=float)
print("python side done:", {k: (v if not isinstance(v, dict) else "...") for k, v in out.items()})
