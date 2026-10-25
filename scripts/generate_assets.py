# -*- coding: utf-8 -*-
"""Sinh toàn bộ hình minh họa cho bộ slide SIFT & ORB.
Ảnh thật chạy từ OpenCV + sơ đồ matplotlib. Chạy: .venv/bin/python scripts/generate_assets.py
"""
import os
import cv2
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch, Rectangle

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.dirname(OUT)
HTML_DIR = os.path.join(ROOT, "sift-orb-html")
HTML_IMG = os.path.join(HTML_DIR, "img")
os.makedirs(HTML_IMG, exist_ok=True)

NAVY = "#0F2B46"; BLUE = "#2E86DE"; ORANGE = "#E67E22"; GREEN = "#0E9F6E"
RED = "#E02424"; GRAY = "#64748B"; LIGHT = "#F4F7FA"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 13,
    "axes.edgecolor": GRAY,
    "figure.facecolor": "white",
    "savefig.facecolor": "white",
})

rng = np.random.default_rng(42)

# ----------------------------------------------------------------素材
SRC = "/usr/share/backgrounds/Blue_flower_by_Elena_Stravoravdi.jpg"
img_color = cv2.imread(SRC)
img_color = cv2.resize(img_color, (1000, 563))
img_gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)

# Ảnh biến đổi: xoay 35°, thu nhỏ 72%, tăng sáng
def make_transformed(img, angle=35, scale=0.72, bright=30):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    out = cv2.warpAffine(img, M, (nw, nh), borderValue=(255, 255, 255))
    out = np.clip(out.astype(np.int16) + bright, 0, 255).astype(np.uint8)
    return out

img2_color = make_transformed(img_color)
img2_gray = cv2.cvtColor(img2_color, cv2.COLOR_BGR2GRAY)
cv2.imwrite(os.path.join(OUT, "_img1.png"), img_color)
cv2.imwrite(os.path.join(OUT, "_img2.png"), img2_color)


def bgr2rgb(im):
    return cv2.cvtColor(im, cv2.COLOR_BGR2RGB)


def save(fig, name, dpi=160):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=dpi, bbox_inches="tight", pad_inches=0.15)
    plt.close(fig)
    print("saved", name)


# ================================================================ 1. Pipeline tổng quan
def pipeline_diagram():
    fig, ax = plt.subplots(figsize=(13.5, 3.6))
    ax.set_xlim(0, 13.5); ax.set_ylim(0, 3.6); ax.axis("off")
    steps = [
        ("ẢNH ĐẦU VÀO", "Ảnh xám / video frame", GRAY),
        ("① DETECT", "Tìm keypoint:\ncorner, blob...\n(WHERE)", BLUE),
        ("② DESCRIBE", "Vector mô tả quanh\nmỗi keypoint\n(HOW IT LOOKS)", GREEN),
        ("③ MATCH", "So khớp vector giữa\ncác ảnh (distance)", ORANGE),
    ]
    x = 0.25
    from matplotlib.patches import FancyBboxPatch
    for i, (title, sub, c) in enumerate(steps):
        box = FancyBboxPatch((x, 1.15), 2.7, 1.55, boxstyle="round,pad=0.12",
                             fc=LIGHT, ec=c, lw=2.6)
        ax.add_patch(box)
        ax.text(x + 1.35, 2.32, title, ha="center", va="center",
                fontsize=15, fontweight="bold", color=c)
        ax.text(x + 1.35, 1.62, sub, ha="center", va="center", fontsize=11.5, color=NAVY)
        if i < 3:
            ax.annotate("", xy=(x + 3.35, 1.93), xytext=(x + 2.95, 1.93),
                        arrowprops=dict(arrowstyle="-|>", lw=3, color=NAVY))
        x += 3.35
    ax.annotate("SIFT: DoG + 128-D float        ORB: FAST + 256-bit binary",
                xy=(6.75, 0.62), ha="center", fontsize=12.5, color=GRAY, style="italic")
    save(fig, "00_pipeline.png")


# ================================================================ 2. Feature concept: flat / edge / corner
def feature_concept():
    h, w = img_gray.shape
    crops = [
        ("Vùng PHẲNG (flat)\n→ không tìm lại được", (int(w*0.55), int(h*0.06), 120)),
        ("CẠNH (edge)\n→ vẫn mơ hồ khi dịch", (int(w*0.30), int(h*0.30), 120)),
        ("GÓC (corner)\n→ duy nhất, dễ nhận diện", (int(w*0.75), int(h*0.55), 120)),
    ]
    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.4))
    for ax, (label, (cx, cy, r)) in zip(axes, crops):
        x0, y0 = max(cx - r, 0), max(cy - r, 0)
        patch = img_gray[y0:y0 + 2*r, x0:x0 + 2*r]
        axes_img = ax.imshow(patch, cmap="gray")
        ax.set_title(label, fontsize=13, color=NAVY, fontweight="bold", pad=10)
        ax.axis("off")
    fig.suptitle("Local feature = vùng nhỏ có thể « tái định danh » duy nhất trong ảnh",
                 fontsize=15, color=NAVY, y=1.04)
    save(fig, "01_feature_concept.png")


# ================================================================ 3. Gaussian pyramid + DoG thật
def gaussian_dog():
    k = np.sqrt(2)
    sigmas = [1.6, 1.6*k, 1.6*k**2, 1.6*k**3]
    blurred, dog = [], []
    prev = None
    for s in sigmas:
        b = cv2.GaussianBlur(img_gray, (0, 0), s)
        blurred.append(b)
        if prev is not None:
            d = cv2.subtract(prev, b)
            d = cv2.normalize(d, None, 0, 255, cv2.NORM_MINMAX)
            dog.append(d)
        prev = b

    fig, axes = plt.subplots(2, 4, figsize=(13.8, 6.2))
    crop = (slice(80, 400), slice(280, 760))  # vùng giàu chi tiết
    for i, (b, s) in enumerate(zip(blurred, sigmas)):
        axes[0, i].imshow(b[crop], cmap="gray")
        axes[0, i].set_title(f"Gaussian σ = {s:.2f}", fontsize=13, color=BLUE, fontweight="bold")
        axes[0, i].axis("off")
    for i, d in enumerate(dog):
        axes[1, i].imshow(d[crop], cmap="seismic")
        axes[1, i + 1].set_title("", fontsize=10)
        axes[1, i].set_title(f"DoG (kσ) − (σ)", fontsize=13, color=RED, fontweight="bold")
        axes[1, i].axis("off")
    axes[1, 3].axis("off")
    axes[1, 3].text(0.5, 0.5, "DoG ≈ xấp xỉ\nLoG (Laplacian of Gaussian)\n→ tìm blob ở nhiều tỉ lệ",
                    ha="center", va="center", fontsize=13, color=NAVY,
                    bbox=dict(boxstyle="round,pad=0.6", fc=LIGHT, ec=BLUE, lw=2))
    save(fig, "02_gaussian_dog.png")


# ================================================================ 4. Schematic scale-space octaves
def octaves_diagram():
    # Ghép ảnh thật thành 3 nhóm octave, mỗi nhóm 3 mức σ (ảnh nhỏ dần)
    groups = []
    base = img_gray
    for oi in range(3):
        levels = []
        im = base
        for li in range(3):
            disp = cv2.resize(im, (170 >> li, 96 >> li)) if li else cv2.resize(im, (170, 96))
            levels.append(disp)
            im = cv2.pyrDown(im)
        groups.append(levels)
        base = cv2.pyrDown(base)

    W, H, GAP, GGRP = 170, 96, 14, 40
    PH, PW = 260, 3*W + 2*GAP + 2*GGRP + 170
    canvas = np.full((PH, PW), 245, dtype=np.uint8)
    fig, ax = plt.subplots(figsize=(13.0, 4.9))
    ax.imshow(canvas, cmap="gray", vmin=0, vmax=255)
    for oi, levels in enumerate(groups):
        gx0 = GGRP + oi * (W + 2*GAP + GGRP)
        # tiêu đề octave phía trên
        ax.text(gx0 + (W + 2*GAP + W/2)/2, 40, f"Octave {oi}",
                ha="center", va="center", fontsize=16, fontweight="bold", color=NAVY)
        ax.text(gx0 + (W + 2*GAP + W/2)/2, 62, f"ảnh thu nhỏ 2^{oi}×\nσ tăng dần (k = √2)",
                ha="center", va="center", fontsize=10, color=GRAY)
        for li, lv in enumerate(levels):
            h, w = lv.shape
            y0 = 80 + (96 - h)
            x0 = gx0 + li * (W//3 + GAP - 8)
            canvas_fig = ax.imshow(lv, cmap="gray", extent=[x0, x0 + w, y0, y0 + h],
                                   vmin=0, vmax=255, zorder=2)
        if oi < 2:
            ax.annotate("", xy=(gx0 + W + 2*GAP + GGRP + W/2 + W/3 - 12, 128),
                        xytext=(gx0 + W + 2*GAP + GGRP + W/2 - 12, 128),
                        arrowprops=dict(arrowstyle="-|>", lw=2.8, color=ORANGE), zorder=5)
    ax.set_xlim(0, PW); ax.set_ylim(PH, 0); ax.axis("off")
    ax.set_title("Scale-space: mỗi octave = ảnh thu nhỏ ½ + chuỗi σ tăng (k = √2)",
                 fontsize=15, color=NAVY, pad=10)
    save(fig, "03_octaves.png")
    save_jpg(fig, "03_octaves.jpg")


# ================================================================ 5. SIFT keypoints thật
def sift_keypoints():
    sift = cv2.SIFT_create(nfeatures=800)
    kp, des = sift.detectAndCompute(img_gray, None)
    drawn = cv2.drawKeypoints(img_color, kp, None,
                              flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS,
                              color=(46, 134, 222))
    fig, ax = plt.subplots(figsize=(13.5, 8.2))
    ax.imshow(bgr2rgb(drawn))
    ax.axis("off")
    ax.set_title(f"SIFT phát hiện {len(kp)} keypoints — vòng tròn = kích thước (scale), vạch = hướng (orientation)",
                 fontsize=14.5, color=NAVY, pad=12)
    save(fig, "04_sift_keypoints.png")
    return kp, des


# ================================================================ 6. Orientation: quiver + histogram thật
def orientation_viz(kp):
    # chọn keypoint to, gần giữa ảnh
    best = max(kp, key=lambda k: k.size * (0.5 < k.pt[0]/img_gray.shape[1] < 0.8) * (0.2 < k.pt[1]/img_gray.shape[0] < 0.8))
    cx, cy = int(best.pt[0]), int(best.pt[1])
    r = int(np.clip(best.size * 2, 20, 52))
    y0, y1 = max(cy - r, 0), min(cy + r, img_gray.shape[0])
    x0, x1 = max(cx - r, 0), min(cx + r, img_gray.shape[1])
    patch = img_gray.astype(np.float32)[y0:y1, x0:x1]

    gx = cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)

    fig = plt.figure(figsize=(13.8, 5.4))
    gs = fig.add_gridspec(1, 2, width_ratios=[1, 1.25])

    ax1 = fig.add_subplot(gs[0])
    ax1.imshow(patch.astype(np.uint8), cmap="gray")
    yy, xx = np.mgrid[0:patch.shape[0], 0:patch.shape[1]]
    step = 4
    hsv = np.stack([np.mod(ang, 360) / 360, np.ones_like(mag), np.clip(mag / (mag.max() + 1e-6), 0, 1)], axis=-1)
    colors = hsv[::step, ::step].reshape(-1, 3)
    ax1.quiver(xx[::step, ::step], yy[::step, ::step], gx[::step, ::step], -gy[::step, ::step],
               color=colors, scale=380, width=0.004, pivot="mid")
    ax1.plot(patch.shape[1]/2, patch.shape[0]/2, "r+", ms=16, mew=3)
    ax1.set_title("Gradient từng pixel quanh keypoint\n(màu = hướng, dài = độ lớn)",
                  fontsize=13.5, color=NAVY)
    ax1.axis("off")

    # histogram 36 bins có trọng số Gaussian
    ph, pw = patch.shape
    yy2, xx2 = np.mgrid[0:ph, 0:pw]
    d2 = (xx2 - pw/2)**2 + (yy2 - ph/2)**2
    wgt = np.exp(-d2 / (2 * (1.5 * best.size / 2 * (pw/(2*r)))**2)) if pw == 2*r else np.exp(-d2 / (2*(0.5*min(ph,pw))**2))
    bins = np.arange(0, 37) * 10
    hist = np.zeros(36)
    for b in range(36):
        m = (ang >= b*10) & (ang < (b+1)*10)
        hist[b] = np.sum(mag[m] * wgt[m])
    hist /= hist.max()
    ax2 = fig.add_subplot(gs[1])
    ax2.bar(bins[:-1], hist, width=8, color=BLUE, edgecolor=NAVY, align="edge")
    peak = int(np.argmax(hist)) * 10
    ax2.axvline(peak, color=RED, lw=2.5, ls="--")
    ax2.text(peak + 6, 0.92, f"peak → gán orientation\nθ ≈ {peak}°", color=RED, fontsize=13, fontweight="bold")
    ax2.set_xlabel("Hướng gradient (độ)", fontsize=12.5)
    ax2.set_ylabel("Tổng trọng số (chuẩn hoá)", fontsize=12.5)
    ax2.set_title("Histogram 36 bins × 10° — tính từ gradient thật của patch",
                  fontsize=13.5, color=NAVY)
    ax2.set_xticks(np.arange(0, 361, 45))
    save(fig, "05_orientation.png")
    return best


# ================================================================ 7. Descriptor 4x4x8 grid thật
def descriptor_grid(kp):
    best = max(kp, key=lambda k: k.size * (0.3 < k.pt[0]/img_gray.shape[1] < 0.85) * (0.15 < k.pt[1]/img_gray.shape[0] < 0.85))
    cx, cy = int(best.pt[0]), int(best.pt[1])
    r = int(np.clip(best.size * 2, 24, 48))
    r -= r % 4
    y0, x0 = max(cy - r, 0), max(cx - r, 0)
    patch = img_gray.astype(np.float32)[y0:y0 + 2*r, x0:x0 + 2*r]
    gx = cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)

    fig, ax = plt.subplots(figsize=(8.6, 8.6))
    ax.imshow(patch.astype(np.uint8), cmap="gray")
    n = 4
    cell = patch.shape[1] / n
    for i in range(n + 1):
        ax.axhline(i * cell, color=GREEN, lw=2)
        ax.axvline(i * cell, color=GREEN, lw=2)
    cmap = plt.cm.hsv
    for i in range(n):
        for j in range(n):
            ys, ye = int(i*cell), int((i+1)*cell)
            xs, xe = int(j*cell), int((j+1)*cell)
            h = np.zeros(8)
            for b in range(8):
                m = (ang[ys:ye, xs:xe] >= b*45) & (ang[ys:ye, xs:xe] < (b+1)*45)
                h[b] = mag[ys:ye, xs:xe][m].sum()
            if h.max() > 0:
                h /= h.max()
            ccx, ccy = (j + 0.5) * cell, (i + 0.5) * cell
            L = cell * 0.38
            for b in range(8):
                th = np.deg2rad(b * 45)
                ax.annotate("", xy=(ccx + L*h[b]*np.cos(th), ccy - L*h[b]*np.sin(th)),
                            xytext=(ccx, ccy),
                            arrowprops=dict(arrowstyle="-|>", color=cmap(b/8), lw=2.2))
    ax.set_title("Descriptor SIFT: lưới 4×4 ô × histogram 8 hướng\n= vector 128 chiều (tính từ patch thật)",
                 fontsize=14.5, color=NAVY, pad=14)
    ax.axis("off")
    save(fig, "06_descriptor_grid.png")


# ================================================================ 8. SIFT matching thật
def sift_matching():
    sift = cv2.SIFT_create(nfeatures=1200)
    kp1, des1 = sift.detectAndCompute(img_gray, None)
    kp2, des2 = sift.detectAndCompute(img2_gray, None)
    bf = cv2.BFMatcher()
    matches = bf.knnMatch(des1, des2, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]
    good = sorted(good, key=lambda m: m.distance)[:80]
    drawn = cv2.drawMatches(img_color, kp1, img2_color, kp2, good, None,
                            matchColor=(46, 134, 222), singlePointColor=(230, 126, 34),
                            flags=cv2.DRAW_MATCHES_FLAGS_NOT_DRAW_SINGLE_POINTS)
    fig, ax = plt.subplots(figsize=(14, 6.4))
    ax.imshow(bgr2rgb(drawn))
    ax.axis("off")
    ax.set_title(f"SIFT + ratio test 0.75: {len(good)} cặp khớp tốt (trong {len(matches)} ứng viên) — ảnh phải đã XOAY 35° + THU NHỎ + SÁNG HƠN",
                 fontsize=13.5, color=NAVY, pad=10)
    save(fig, "07_sift_matching.png")
    return len(kp1), len(kp2), len(good)


# ================================================================ 9. FAST: vòng tròn 16 điểm + ảnh thật
def fast_viz():
    # (a) sơ đồ vòng tròn 16 pixel bán kính 3
    fig = plt.figure(figsize=(13.8, 5.2))
    gs = fig.add_gridspec(1, 2, width_ratios=[0.85, 1.15])
    ax1 = fig.add_subplot(gs[0])
    ax1.set_xlim(-5, 5); ax1.set_ylim(-5, 5); ax1.set_aspect("equal"); ax1.axis("off")
    for a in range(16):
        th = np.pi/2 - a * 2*np.pi/16
        x, y = 3*np.cos(th), 3*np.sin(th)
        bright = a in {1, 2, 3, 4, 5, 6, 7}   # cung sáng liên tiếp
        ax1.add_patch(Circle((x, y), 0.34, fc=(GREEN if bright else "#CBD5E1"), ec=NAVY, lw=1.4, zorder=3))
        ax1.text(x*1.22, y*1.22, str(a + 1), ha="center", va="center", fontsize=10.5, color=GRAY)
    ax1.add_patch(Circle((0, 0), 0.42, fc=RED, ec=NAVY, lw=1.6, zorder=3))
    ax1.text(0, -0.02, "p", ha="center", va="center", color="white", fontsize=14, fontweight="bold", zorder=4)
    ax1.set_title("FAST: so pixel p với 16 điểm trên vòng tròn bán kính 3\np là corner nếu ≥ 12 điểm liên tiếp sáng/tối hơn p (± t)",
                  fontsize=13, color=NAVY)

    fast = cv2.FastFeatureDetector_create(threshold=35, nonmaxSuppression=True)
    kp = fast.detect(img_gray, None)
    drawn = cv2.drawKeypoints(img_color, kp, None, color=(230, 126, 34))
    ax2 = fig.add_subplot(gs[1])
    ax2.imshow(bgr2rgb(drawn))
    ax2.set_title(f"FAST trên ảnh thật: {len(kp)} keypoints (chỉ corners, chưa có scale)",
                  fontsize=13, color=ORANGE, fontweight="bold")
    ax2.axis("off")
    save(fig, "08_fast.png")


# ================================================================ 10. ORB pyramid
def orb_pyramid():
    orb = cv2.ORB_create(nfeatures=500)
    levels = [img_gray]
    for _ in range(3):
        levels.append(cv2.pyrDown(levels[-1]))
    counts = []
    for lv in levels:
        kp, _ = orb.detectAndCompute(lv, None)
        counts.append(len(kp))
    fig, axes = plt.subplots(1, 4, figsize=(13.8, 4.3))
    for ax, lv, i in zip(axes, levels, range(4)):
        orb_i = cv2.ORB_create(nfeatures=500)
        kp, _ = orb_i.detectAndCompute(lv, None)
        drawn = cv2.drawKeypoints(cv2.cvtColor(lv, cv2.COLOR_GRAY2BGR), kp, None,
                                  color=(230, 126, 34), flags=0)
        ax.imshow(bgr2rgb(drawn))
        ax.set_title(f"Tỉ lệ 1:{2**i} — {len(kp)} keypoints", fontsize=12.5, color=NAVY)
        ax.axis("off")
    fig.suptitle("ORB xử lý scale bằng image pyramid: chạy FAST trên nhiều mức thu nhỏ",
                 fontsize=15, color=NAVY, y=1.03)
    save(fig, "09_orb_pyramid.png")


# ================================================================ 11. Intensity centroid
def centroid_viz():
    orb = cv2.ORB_create(nfeatures=2000)
    kp, _ = orb.detectAndCompute(img_gray, None)
    best = max(kp, key=lambda k: k.response * (0.2 < k.pt[0]/img_gray.shape[1] < 0.9) * (0.1 < k.pt[1]/img_gray.shape[0] < 0.9))
    r = 31
    cx, cy = int(best.pt[0]), int(best.pt[1])
    y0, x0 = max(cy - r, 0), max(cx - r, 0)
    patch = img_gray[y0:y0 + 2*r, x0:x0 + 2*r].astype(np.float32)
    # moments trên patch (trên toạ độ centroid của cường độ)
    yy, xx = np.mgrid[0:patch.shape[0], 0:patch.shape[1]]
    m00 = patch.sum()
    m10 = (patch * xx).sum(); m01 = (patch * yy).sum()
    cxd, cyd = m10 / m00, m01 / m00
    theta = np.degrees(np.arctan2(cyd - patch.shape[0]/2, cxd - patch.shape[1]/2)) % 360

    fig, axes = plt.subplots(1, 2, figsize=(12.6, 5.6))
    axes[0].imshow(patch.astype(np.uint8), cmap="viridis")
    axes[0].plot(patch.shape[1]/2, patch.shape[0]/2, "r+", ms=18, mew=3, label="tâm patch o")
    axes[0].plot(cxd, cyd, "wo", ms=10, mec=NAVY, mew=2, label="centroid C (sáng hơn → nặng hơn)")
    axes[0].annotate("", xy=(cxd, cyd), xytext=(patch.shape[1]/2, patch.shape[0]/2),
                     arrowprops=dict(arrowstyle="-|>", color="red", lw=3))
    axes[0].legend(loc="lower left", fontsize=10.5, framealpha=0.9)
    axes[0].set_title(f"Intensity centroid: θ = atan2(m01, m10) ≈ {theta:.0f}° (tính từ patch thật)",
                      fontsize=13, color=NAVY)
    axes[0].axis("off")

    # phải: patch xoay theo theta rồi trích BRIEF
    M = cv2.getRotationMatrix2D((patch.shape[1]/2, patch.shape[0]/2), theta, 1.0)
    rot = cv2.warpAffine(patch, M, (patch.shape[1], patch.shape[0]))
    axes[1].imshow(rot.astype(np.uint8), cmap="viridis")
    axes[1].set_title("Patch được « xoay chuẩn hoá » về θ = 0° trước khi trích rBRIEF\n→ descriptor bất biến xoay",
                      fontsize=13, color=GREEN)
    axes[1].axis("off")
    save(fig, "10_centroid.png")


# ================================================================ 12. BRIEF vs steered rBRIEF
def brief_viz():
    n_show = 38
    pts = rng.uniform(-13, 13, (256, 4))
    theta = np.deg2rad(35)
    c, s = np.cos(theta), np.sin(theta)
    R = np.array([[c, -s], [s, c]])
    pts_rot = (pts.reshape(-1, 2) @ R.T).reshape(pts.shape)
    fig, axes = plt.subplots(1, 2, figsize=(12.8, 6.2))
    for ax, (data, title, col) in zip(axes, [
        (pts, "BRIEF gốc: cặp điểm ngẫu nhiên cố định", BLUE),
        (pts_rot, "rBRIEF («steered»): pattern xoay theo θ của keypoint", GREEN),
    ]):
        ax.add_patch(Rectangle((-15.5, -15.5), 31, 31, fill=False, ec=NAVY, lw=2))
        ax.set_xlim(-17, 17); ax.set_ylim(-17, 17); ax.set_aspect("equal"); ax.axis("off")
        for (x1, y1, x2, y2) in data[:n_show]:
            ax.plot([x1, x2], [y1, y2], color=col, alpha=0.55, lw=1.4)
            ax.plot([x1, x2], [y1, y2], "o", color=col, ms=4.5)
        ax.set_title(title, fontsize=13.5, color=NAVY)
    fig.text(0.5, 0.015,
             "Mỗi cặp (x₁,x₂): nếu I(x₁) < I(x₂) → bit 1, ngược lại → bit 0. 256 cặp = 256-bit descriptor",
             ha="center", fontsize=13.5, color=GRAY, style="italic")
    save(fig, "11_brief.png")


# ================================================================ 13. ORB keypoints + matching
def orb_matching():
    orb = cv2.ORB_create(nfeatures=1500)
    kp1, des1 = orb.detectAndCompute(img_gray, None)
    kp2, des2 = orb.detectAndCompute(img2_gray, None)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    matches = bf.knnMatch(des1, des2, k=2)
    good = [m for m, n in matches if m.distance < 0.8 * n.distance]
    good = sorted(good, key=lambda m: m.distance)[:80]

    drawn_kp = cv2.drawKeypoints(img_color, kp1, None, color=(230, 126, 34))
    fig, axes = plt.subplots(2, 1, figsize=(13.6, 9.4))
    axes[0].imshow(bgr2rgb(drawn_kp))
    axes[0].set_title(f"ORB phát hiện {len(kp1)} keypoints (FAST + Harris + pyramid)", fontsize=14, color=ORANGE, fontweight="bold")
    axes[0].axis("off")

    dm = cv2.drawMatches(img_color, kp1, img2_color, kp2, good, None,
                         matchColor=(16, 185, 129), singlePointColor=(230, 126, 34),
                         flags=cv2.DRAW_MATCHES_FLAGS_NOT_DRAW_SINGLE_POINTS)
    axes[1].imshow(bgr2rgb(dm))
    axes[1].set_title(f"ORB + Hamming distance + ratio test: {len(good)} cặp khớp tốt — cùng cặp ảnh xoay/thu nhỏ như SIFT",
                      fontsize=13.5, color=NAVY)
    axes[1].axis("off")
    save(fig, "12_orb_matching.png")
    return len(kp1), len(good)


# ================================================================ 14. Benchmark + so sánh keypoints
def benchmark():
    sift = cv2.SIFT_create(nfeatures=800)
    orb = cv2.ORB_create(nfeatures=800)
    t_sift = t_orb = 0.0
    N = 30
    for _ in range(5):  # warm-up
        sift.detectAndCompute(img_gray, None); orb.detectAndCompute(img_gray, None)
    import time
    for _ in range(N):
        t0 = time.perf_counter(); sift.detectAndCompute(img_gray, None); t_sift += time.perf_counter() - t0
        t0 = time.perf_counter(); orb.detectAndCompute(img_gray, None); t_orb += time.perf_counter() - t0
    t_sift *= 1000 / N; t_orb *= 1000 / N

    fig, axes = plt.subplots(1, 2, figsize=(13.6, 4.9), gridspec_kw={"width_ratios": [1, 1.25]})
    kp_s, _ = sift.detectAndCompute(img_gray, None)
    kp_o, _ = orb.detectAndCompute(img_gray, None)
    d1 = cv2.drawKeypoints(img_color, kp_s, None, color=(46, 134, 222), flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    d2 = cv2.drawKeypoints(img_color, kp_o, None, color=(230, 126, 34))
    axes[0].imshow(np.hstack([bgr2rgb(d1), bgr2rgb(d2)]))
    axes[0].axis("off")
    axes[0].set_title(f"SIFT: {len(kp_s)} kp (xanh)     |     ORB: {len(kp_o)} kp (cam)", fontsize=13.5, color=NAVY)

    bars = axes[1].bar(["SIFT", "ORB"], [t_sift, t_orb], color=[BLUE, ORANGE], width=0.5, edgecolor=NAVY)
    for b, v in zip(bars, [t_sift, t_orb]):
        axes[1].text(b.get_x() + b.get_width()/2, v * 1.06, f"{v:.1f} ms", ha="center",
                     fontsize=14, fontweight="bold", color=NAVY)
    axes[1].set_ylabel("Thời gian detect+describe (ms)", fontsize=12.5)
    axes[1].set_title(f"Benchmark thật trên cùng ảnh 1000×563 (trung bình {N} lần)\nORB nhanh hơn ~{t_sift/t_orb:.0f}×",
                      fontsize=13.5, color=NAVY)
    axes[1].set_ylim(0, max(t_sift, t_orb) * 1.22)
    save(fig, "13_benchmark.png")
    return t_sift, t_orb, len(kp_s), len(kp_o)


# ================================================================ 15. Hero background cho trang bìa
def hero():
    sift = cv2.SIFT_create(nfeatures=400)
    kp, _ = sift.detectAndCompute(img_gray, None)
    drawn = cv2.drawKeypoints(img_color, kp, None, flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS, color=(80, 180, 255))
    big = cv2.resize(drawn, (1920, 1082))
    overlay = big.copy()
    cv2.rectangle(overlay, (0, 0), (1920, 1082), (10, 20, 38), -1)
    cv2.addWeighted(overlay, 0.55, big, 0.45, 0, big)
    cv2.imwrite(os.path.join(OUT, "hero.png"), big)
    print("saved hero.png")


# ================================================================ 16. Kiểm chứng brute-force con số 205,590
def verify_205590():
    """C(676,2) − (số cặp 2 ô 5×5 chồng lấn trong lưới 26×26) phải = 205,590 (ORB paper §4.3)."""
    N, W = 26, 5
    pos = [(i, j) for i in range(N) for j in range(N)]
    total = len(pos) * (len(pos) - 1) // 2          # C(676,2)
    overlap = 0
    for a in range(len(pos)):
        ax, ay = pos[a]
        for b in range(a + 1, len(pos)):
            if abs(ax - pos[b][0]) < W and abs(ay - pos[b][1]) < W:
                overlap += 1
    print(f"verify_205590: C(676,2) = {total:,} − overlapping = {overlap:,} → {total - overlap:,}")
    assert total - overlap == 205590, "sai số học!"
    return total, overlap


# ================================================================ 17. Cùng một ảnh qua SIFT và ORB
def save_jpg(fig, name, dpi=160):
    """Lưu figure thành JPG nén trực tiếp vào sift-orb-html/img/."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", pad_inches=0.12)
    buf.seek(0)
    im = Image.open(buf).convert("RGB")
    im.save(os.path.join(HTML_IMG, name), "JPEG", quality=88, optimize=True)
    print("saved", os.path.join("sift-orb-html/img", name))


def same_image_compare():
    sift = cv2.SIFT_create(nfeatures=800)
    orb = cv2.ORB_create(nfeatures=800)
    kp_s, des_s1 = sift.detectAndCompute(img_gray, None)
    kp_o, des_o1 = orb.detectAndCompute(img_gray, None)

    # (a) keypoints trên cùng ảnh gốc
    fig, axes = plt.subplots(2, 1, figsize=(12.8, 7.6))
    d1 = cv2.drawKeypoints(img_color, kp_s, None, color=(46, 134, 222),
                           flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    axes[0].imshow(bgr2rgb(d1)); axes[0].axis("off")
    axes[0].set_title(f"SIFT — {len(kp_s)} keypoints trên cùng một ảnh: vòng tròn = scale σ, vạch = hướng θ",
                      fontsize=13, color=BLUE, fontweight="bold")
    d2 = cv2.drawKeypoints(img_color, kp_o, None, color=(230, 126, 34), flags=0)
    axes[1].imshow(bgr2rgb(d2)); axes[1].axis("off")
    axes[1].set_title(f"ORB — {len(kp_o)} keypoints trên cùng ảnh đó: FAST corner + Harris, không vòng scale",
                      fontsize=13, color=ORANGE, fontweight="bold")
    save(fig, "14_same_image_kp.png")
    save_jpg(fig, "14_same_image_kp.jpg")

    # (b) matching trên cùng cặp ảnh biến đổi
    kp_s2, des_s2 = sift.detectAndCompute(img2_gray, None)
    kp_o2, des_o2 = orb.detectAndCompute(img2_gray, None)
    bf_f = cv2.BFMatcher(cv2.NORM_L2)
    m_s = [m for m, n in bf_f.knnMatch(des_s1, des_s2, k=2) if m.distance < 0.75 * n.distance]
    m_o = [m for m, n in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(des_o1, des_o2, k=2) if m.distance < 0.8 * n.distance]
    m_s, m_o = sorted(m_s, key=lambda m: m.distance)[:80], sorted(m_o, key=lambda m: m.distance)[:80]

    import time
    for _ in range(3):
        sift.detectAndCompute(img_gray, None); orb.detectAndCompute(img_gray, None)
    t_s = t_o = 0.0
    for _ in range(20):
        t0 = time.perf_counter(); sift.detectAndCompute(img_gray, None); t_s += time.perf_counter() - t0
        t0 = time.perf_counter(); orb.detectAndCompute(img_gray, None); t_o += time.perf_counter() - t0
    t_s *= 1000 / 20; t_o *= 1000 / 20

    fig, axes = plt.subplots(2, 1, figsize=(13.2, 9.2))
    dm1 = cv2.drawMatches(img_color, kp_s, img2_color, kp_s2, m_s, None,
                          matchColor=(46, 134, 222), singlePointColor=(230, 126, 34),
                          flags=cv2.DRAW_MATCHES_FLAGS_NOT_DRAW_SINGLE_POINTS)
    axes[0].imshow(bgr2rgb(dm1)); axes[0].axis("off")
    axes[0].set_title(f"SIFT · Euclidean + ratio 0.75 → {len(m_s)} matches tốt · detect+describe {t_s:.1f} ms",
                      fontsize=13, color=BLUE, fontweight="bold")
    dm2 = cv2.drawMatches(img_color, kp_o, img2_color, kp_o2, m_o, None,
                          matchColor=(16, 185, 129), singlePointColor=(230, 126, 34),
                          flags=cv2.DRAW_MATCHES_FLAGS_NOT_DRAW_SINGLE_POINTS)
    axes[1].imshow(bgr2rgb(dm2)); axes[1].axis("off")
    axes[1].set_title(f"ORB · Hamming + ratio 0.8 → {len(m_o)} matches tốt · detect+describe {t_o:.1f} ms",
                      fontsize=13, color=ORANGE, fontweight="bold")
    save(fig, "15_same_image_match.png")
    save_jpg(fig, "15_same_image_match.jpg")
    return len(kp_s), len(kp_o), len(m_s), len(m_o), t_s, t_o


# ================================================================ 18. Xuất real_data.js — số thật cho các tensor-box
FAST_RING_JS = [(0,-3),(1,-3),(2,-2),(3,-1),(3,0),(3,1),(2,2),(1,3),(0,3),(-1,3),(-2,2),(-3,1),(-3,0),(-3,-1),(-2,-2),(-1,-3)]

def export_real_data(versus_stats):
    import json
    R = {}

    # ---- gray: kernel Gaussian 5×5 (σ=1.0) + crop 5×5 RGB → luma (tại điểm giàu texture)
    sig = 1.0
    ax_ = np.arange(-2, 3)
    g1 = np.exp(-(ax_ ** 2) / (2 * sig * sig)); g1 /= g1.sum()
    k5 = np.outer(g1, g1)
    R["gray"] = {"kernel5": [[round(float(v), 4) for v in row] for row in k5], "kernelSigma": sig}

    # ---- dog: giá trị L(σ), L(kσ), D tại 1 pixel có texture (|D| lớn nhất vùng giữa ảnh)
    k = np.sqrt(2)
    La_ = cv2.GaussianBlur(img_gray, (0, 0), 1.6).astype(np.float32)
    Lb_ = cv2.GaussianBlur(img_gray, (0, 0), 1.6 * k).astype(np.float32)
    Dmap = Lb_ - La_
    crop = np.zeros_like(Dmap); crop[120:440, 220:800] = 1
    py, px = np.unravel_index(np.argmax(np.abs(Dmap) * crop), Dmap.shape)
    R["dog"] = {"x": int(px), "y": int(py), "sigma": 1.6, "ksigma": round(1.6 * k, 3),
                "La": round(float(La_[py, px]), 1), "Lb": round(float(Lb_[py, px]), 1),
                "D": round(float(Dmap[py, px]), 1)}

    # ---- hess: Hessian 2×2 của DoG bằng sai phân trung tâm tại chính pixel trên (mượn phép thử Harris)
    f = lambda dx, dy: float(Dmap[py + dy, px + dx])
    dxx = f(1, 0) + f(-1, 0) - 2 * f(0, 0)
    dyy = f(0, 1) + f(0, -1) - 2 * f(0, 0)
    dxy = (f(1, 1) + f(-1, -1) - f(1, -1) - f(-1, 1)) / 4
    det = dxx * dyy - dxy * dxy; tr = dxx + dyy
    ratio = float(tr * tr / det) if det > 1e-9 else None
    R["hess"] = {"x": int(px), "y": int(py), "sigma": 1.6,
                 "stencil": [[round(float(Dmap[py + dy, px + dx]), 1) for dx in (-1, 0, 1)] for dy in (-1, 0, 1)],
                 "D": round(f(0, 0), 1),
                 "dxx": round(dxx, 2), "dyy": round(dyy, 2), "dxy": round(dxy, 2),
                 "H": [[round(dxx, 2), round(dxy, 2)], [round(dxy, 2), round(dyy, 2)]],
                 "det": round(det, 2), "trace": round(tr, 2),
                 "ratio": round(ratio, 1) if ratio is not None else "∞",
                 "keep": bool(ratio is not None and ratio < 12.1),
                 "dx": round((f(1, 0) - f(-1, 0)) / 2, 2), "dy": round((f(0, 1) - f(0, -1)) / 2, 2)}

    # ---- sift: keypoint mạnh nhất + descriptor 128-D (16 giá trị đầu) + khoảng cách match
    sift = cv2.SIFT_create(nfeatures=800)
    kp1, des1 = sift.detectAndCompute(img_gray, None)
    kp2, des2 = sift.detectAndCompute(img2_gray, None)
    bi = int(np.argmax([k.response for k in kp1]))
    d = des1[bi].astype(np.float64)
    # OpenCV chuẩn hoá SIFT descriptor về thang 512 — chia lại cho đúng đơn vị ‖v‖ = 1 như paper
    des_unit = d / 512.0
    norm0 = float(np.linalg.norm(des_unit))
    n_clamped = int(np.sum(d >= 0.2 * 512 - 1))   # bị kẹp ở bước clamp 0.2 (trước renormalise cuối)
    bf = cv2.BFMatcher()
    mm = sorted(bf.match(des1, des2), key=lambda m: m.distance)
    eu = float(min(m.distance for m in mm if m.queryIdx == bi)) if any(m.queryIdx == bi for m in mm) else float(mm[0].distance)
    R["sift"] = {
        "kp": {"x": round(kp1[bi].pt[0]), "y": round(kp1[bi].pt[1]),
               "sigma": round(kp1[bi].size / 2, 1), "angle": round(kp1[bi].angle, 1), "response": round(kp1[bi].response, 1)},
        "desc16": [[round(float(v), 3) for v in des_unit[:8]], [round(float(v), 3) for v in des_unit[8:16]]],
        "descNorm": round(norm0, 3), "nClamped": n_clamped, "euclid": round(eu / 512.0, 3),
    }

    # ---- fast: 16 giá trị vòng thật tại 1 corner
    fast = cv2.FastFeatureDetector_create(threshold=20, nonmaxSuppression=True)
    fk = fast.detect(img_gray, None)
    fk = max(fk, key=lambda q: q.response)
    fx, fy = int(fk.pt[0]), int(fk.pt[1])
    t = 20
    Ip = float(img_gray[fy, fx])
    ring, states = [], []
    for dx, dy in FAST_RING_JS:
        v = float(img_gray[fy + dy, fx + dx])
        ring.append(round(v))
        states.append("+1" if v > Ip + t else ("-1" if v < Ip - t else "0"))
    seq = [0 if s == "0" else (1 if s == "+1" else -1) for s in states] * 2
    best_run, run, cur = 0, 0, 0
    for v in seq:
        if v == 0:
            run, cur = 0, 0
        elif v == cur:
            run += 1
        else:
            cur, run = v, 1
        best_run = max(best_run, run)
    R["fast"] = {"x": fx, "y": fy, "t": t, "center": round(Ip), "ring": [ring], "states": [states], "runLen": best_run}

    # ---- harris: M 2×2 tại chính corner đó (gradient trung tâm, cửa sổ 7×7, κ=0.04 — như widget JS)
    gf = img_gray.astype(np.float32)
    Sxx = Syy = Sxy = 0.0
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            gxv = gf[fy + dy, fx + dx + 1] - gf[fy + dy, fx + dx - 1]
            gyv = gf[fy + dy + 1, fx + dx] - gf[fy + dy - 1, fx + dx]
            Sxx += gxv * gxv; Syy += gyv * gyv; Sxy += gxv * gyv
    det = Sxx * Syy - Sxy * Sxy; tr = Sxx + Syy
    disc = max(0.0, tr * tr / 4 - det)
    R["harris"] = {"x": fx, "y": fy,
                   "M": [[round(Sxx), round(Sxy)], [round(Sxy), round(Syy)]],
                   "lam1": round(tr / 2 + np.sqrt(disc)), "lam2": round(tr / 2 - np.sqrt(disc)),
                   "R": round(det - 0.04 * tr * tr)}

    # ---- centroid: moments m00/m10/m01 + θ cho keypoint ORB mạnh nhất
    orb = cv2.ORB_create(nfeatures=2000)
    okp, odes1 = orb.detectAndCompute(img_gray, None)
    _, odes2 = orb.detectAndCompute(img2_gray, None)
    obi = int(np.argmax([k.response for k in okp]))
    ok = okp[obi]
    cx, cy = int(ok.pt[0]), int(ok.pt[1])
    patch = gf[cy - 15:cy + 16, cx - 15:cx + 16]
    yy, xx = np.mgrid[-15:16, -15:16]
    m00 = float(patch.sum()); m10 = float((patch * xx).sum()); m01 = float((patch * yy).sum())
    theta = float(np.degrees(np.arctan2(m01, m10)) % 360)
    R["centroid"] = {"x": cx, "y": cy, "m00": round(m00), "m10": round(m10), "m01": round(m01),
                     "theta": round(theta, 1), "opencvAngle": round(ok.angle, 1)}

    # ---- rbrief: 2 cặp descriptor 256-bit thật + ma trận xoay
    om = [m for m, n in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(odes1, odes2, k=2) if m.distance < 0.8 * n.distance]
    om = sorted(om, key=lambda m: m.distance)
    mi = om[0]
    b1 = np.unpackbits(odes1[mi.queryIdx])
    b2 = np.unpackbits(odes2[mi.trainIdx])
    ham = int(np.sum(b1 != b2))
    far_j = int(np.argmax([np.count_nonzero(odes1[mi.queryIdx] ^ odes1[j]) for j in range(len(odes1))]))
    b3 = np.unpackbits(odes1[far_j])
    ham_far = int(np.sum(b1 != b3))
    th = np.deg2rad(okp[mi.queryIdx].angle)
    c, s = np.cos(th), np.sin(th)
    Rm = np.array([[c, -s], [s, c]])
    rng2 = np.random.default_rng(7)
    pair = rng2.uniform(-12, 12, (2, 2))
    R["rbrief"] = {
        "theta": round(okp[mi.queryIdx].angle, 1),
        "rotMat": [[round(float(Rm[0, 0]), 3), round(float(Rm[0, 1]), 3)],
                   [round(float(Rm[1, 0]), 3), round(float(Rm[1, 1]), 3)]],
        "pairA": [[round(float(pair[0, 0]), 1), round(float(pair[0, 1]), 1)],
                  [round(float(pair[1, 0]), 1), round(float(pair[1, 1]), 1)]],
        "pairB": [[round(float((Rm @ pair)[0, 0]), 1), round(float((Rm @ pair)[0, 1]), 1)],
                  [round(float((Rm @ pair)[1, 0]), 1), round(float((Rm @ pair)[1, 1]), 1)]],
        "match": {"bits1": "".join(map(str, b1)), "bits2": "".join(map(str, b2)), "hamming": ham,
                  "kpAngle": round(okp[mi.queryIdx].angle, 1), "dist": mi.distance},
        "far": {"bits1": "".join(map(str, b1)), "bits2": "".join(map(str, b3)), "hamming": ham_far},
    }
    R["versus"] = {"siftN": versus_stats[0], "orbN": versus_stats[1],
                   "siftMatch": versus_stats[2], "orbMatch": versus_stats[3],
                   "tSift": round(versus_stats[4], 1), "tOrb": round(versus_stats[5], 1),
                   "ratio": round(versus_stats[4] / versus_stats[5], 1)}

    js = ("/* Sinh tự động bởi scripts/generate_assets.py — số liệu thật tính từ OpenCV 5 trên ảnh mẫu.\n"
          "   Đừng sửa tay: chạy lại `.venv/bin/python scripts/generate_assets.py`. */\n"
          '"use strict";\nconst REAL = ' + json.dumps(R, ensure_ascii=False, indent=1) + ";\n")
    with open(os.path.join(HTML_DIR, "js", "real_data.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("saved sift-orb-html/js/real_data.js")
    print("REAL keypoints:", R["sift"]["kp"], "| fast run", R["fast"]["runLen"], "| harris R", R["harris"]["R"],
          "| centroid θ", R["centroid"]["theta"], "vs OpenCV", R["centroid"]["opencvAngle"],
          "| rbrief ham", ham, "far", ham_far,
          "| hess tr²/det", R["hess"]["ratio"], "→", "KEEP" if R["hess"]["keep"] else "REJECT")


if __name__ == "__main__":
    pipeline_diagram()
    feature_concept()
    gaussian_dog()
    octaves_diagram()
    kp_sift, des_sift = sift_keypoints()
    orientation_viz(kp_sift)
    descriptor_grid(kp_sift)
    n1, n2, gm = sift_matching()
    fast_viz()
    orb_pyramid()
    centroid_viz()
    brief_viz()
    okp, ogm = orb_matching()
    ts, to, ks, ko = benchmark()
    hero()
    verify_205590()
    vstats = same_image_compare()
    export_real_data(vstats)
    print(f"\nSTATS sift_kp1={n1} sift_kp2={n2} sift_good={gm} orb_kp={okp} orb_good={ogm}")
    print(f"TIMING sift={ts:.1f}ms orb={to:.1f}ms ratio={ts/to:.1f}x sift_nkp={ks} orb_nkp={ko}")
    print(f"VERSUS sift_kp={vstats[0]} orb_kp={vstats[1]} sift_match={vstats[2]} orb_match={vstats[3]} t_sift={vstats[4]:.1f} t_orb={vstats[5]:.1f}")
