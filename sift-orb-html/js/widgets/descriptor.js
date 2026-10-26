/* Widget SIFT bước 4: descriptor 128-D — lấy window 16×16 XOAY theo θ của Bước 3,
   tính HoG 4×4×8 (nội suy trilinear như paper) và so sánh có/không xoay.
   Cả ba khung hình đều tính thật từ pyramid của ảnh mẫu (dùng chung window.__PYR). */
"use strict";
(() => {
  const mount = document.getElementById("w-descriptor");
  if (!mount) return;
  whenVisible(mount, init);

  function getPyr() {
    if (!window.__PYR) {
      window.__PYR = IMG.sample().then(s => {
        const pyr = IMG.buildSiftPyramid(s.gray, s.w, s.h);
        const ext = IMG.dogExtrema(pyr, 4.0);
        return { pyr, ext, src: s };
      });
    }
    return window.__PYR;
  }

  const TAU = Math.PI * 2;

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <label>Keypoint <select id="ds-kp"></select></label>
        <label><input type="checkbox" id="ds-rot" checked> Lấy mẫu xoay theo θ (Bước 3)</label>
        <span class="w-info" id="ds-kpinfo"></span>
      </div>
      <div class="w-canvas-wrap">
        <div>
          <canvas id="ds-img" width="252" height="252"></canvas>
          <p class="or-caption" style="max-width:252px"><b>① Zoom quanh keypoint (4.2×)</b> — ô vuông đỏ = window 16×16 + lưới 4×4 <b>xoay theo θ</b> của Bước 3 (vạch vàng). Bỏ tick « xoay theo θ » thì khung nằm thẳng theo trục ảnh.</p>
        </div>
        <div>
          <canvas id="ds-patch" width="252" height="252"></canvas>
          <p class="or-caption" style="max-width:252px" id="ds-patchcap"></p>
        </div>
        <div>
          <canvas id="ds-hog" width="252" height="252"></canvas>
          <p class="or-caption" style="max-width:252px"><b>③ HoG 4×4 × 8 hướng</b> — mỗi ô một « hoa » 8 cánh: màu = bin hướng, độ dài = tổng trọng số gradient (độ lớn × Gaussian) đổ vào bin đó.</p>
        </div>
      </div>
      <div style="margin-top:14px">
        <canvas id="ds-vec" width="880" height="120"></canvas>
        <p class="or-caption" style="max-width:880px" id="ds-veccap"></p>
      </div>`;

    const cImg = mount.querySelector("#ds-img").getContext("2d");
    const cPatch = mount.querySelector("#ds-patch").getContext("2d");
    const cHog = mount.querySelector("#ds-hog").getContext("2d");
    const cVec = mount.querySelector("#ds-vec").getContext("2d");
    const capPatch = mount.querySelector("#ds-patchcap");
    const capVec = mount.querySelector("#ds-veccap");
    let data = null, kps = [], sel = 0, mode = true;
    const cache = {};

    function pickKps(ext) {
      const cand = ext.filter(e => e.oct === 0).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
      const out = [];
      for (const e of cand) {
        if (out.every(o => Math.hypot(o.x - e.x, o.y - e.y) > 30)) out.push(e);
        if (out.length >= 6) break;
      }
      return out;
    }

    // θ của keypoint — đúng thuật toán Bước 3: histogram 36 bins + nội suy parabola
    function thetaOf(k) {
      const O0 = data.pyr.octaves[0], L = O0.levels[k.s];
      const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, k.s + 0.5), sw = 1.5 * sig;
      const R = Math.min(18, Math.max(8, Math.round(3 * sw)));
      const H36 = new Float32Array(36);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = k.x + dx, y = k.y + dy;
        if (x < 1 || y < 1 || x >= O0.w - 1 || y >= O0.h - 1) continue;
        const g = IMG.gradAt(L, O0.w, O0.h, x, y);
        const mag = Math.hypot(g.gx, g.gy);
        if (mag < 1e-6) continue;
        const ang = (Math.atan2(g.gy, g.gx) + TAU) % TAU;
        const wgt = mag * Math.exp(-(dx * dx + dy * dy) / (2 * sw * sw));
        const f = ang / TAU * 36, lo = Math.floor(f) % 36;
        H36[lo] += wgt * (1 - (f - Math.floor(f)));
        H36[(lo + 1) % 36] += wgt * (f - Math.floor(f));
      }
      let peak = 0; for (let i = 1; i < 36; i++) if (H36[i] > H36[peak]) peak = i;
      const hp = H36[peak], hm = H36[(peak + 35) % 36], hn = H36[(peak + 1) % 36];
      const den = hm - 2 * hp + hn;
      const d = Math.abs(den) > 1e-9 ? 0.5 * (hm - hn) / den : 0;
      return ((peak + 0.5 + Math.max(-0.5, Math.min(0.5, d))) / 36) * 360;
    }

    // Lấy mẫu window 16×16 (xoay theo θ nếu rot) → gradient → HoG 4×4×8 → vector 128 chuẩn hoá
    function build(k, rot) {
      const O0 = data.pyr.octaves[0], L = O0.levels[k.s], W = O0.w, H = O0.h;
      const th = (rot ? k.theta : 0) * Math.PI / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      const bil = (x, y) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const s = (xx, yy) => L[Math.max(0, Math.min(H - 1, yy)) * W + Math.max(0, Math.min(W - 1, xx))];
        return s(x0, y0) * (1 - fx) * (1 - fy) + s(x0 + 1, y0) * fx * (1 - fy) +
               s(x0, y0 + 1) * (1 - fx) * fy + s(x0 + 1, y0 + 1) * fx * fy;
      };
      // patch canonical 16×16: texel (i, j) → toạ độ ảnh qua khung xoay (u, v ∈ −7.5..7.5)
      const P = new Float32Array(256);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const u = i - 7.5, v = j - 7.5;
        P[j * 16 + i] = bil(k.x + u * cos + v * sin, k.y - u * sin + v * cos);
      }
      // gradient từng texel trong khung canonical (đã « trừ θ »)
      const grads = [];
      for (let j = 1; j < 15; j++) for (let i = 1; i < 15; i++) {
        const gx = P[j * 16 + i + 1] - P[j * 16 + i - 1];
        const gy = P[(j + 1) * 16 + i] - P[(j - 1) * 16 + i];
        const mag = Math.hypot(gx, gy);
        if (mag < 1e-6) continue;
        grads.push({
          i, j,
          ang: (Math.atan2(gy, gx) + TAU) % TAU,
          mag,
          wgt: mag * Math.exp(-((i - 7.5) ** 2 + (j - 7.5) ** 2) / 128), // Gaussian σ = 8 = nửa window
        });
      }
      // HoG 4×4×8 — trilinear: 2 ô không gian kề × 2 bin hướng kề (paper §6.1)
      const T = new Float32Array(128);
      for (const g of grads) {
        const ci = Math.floor(g.i / 4 - 0.5), fi = g.i / 4 - 0.5 - ci;
        const cj = Math.floor(g.j / 4 - 0.5), fj = g.j / 4 - 0.5 - cj;
        const bf = g.ang / TAU * 8, b0 = Math.floor(bf) % 8, fb = bf - Math.floor(bf);
        for (let dc = 0; dc < 2; dc++) for (let dr = 0; dr < 2; dr++) {
          const c = ci + dc, r = cj + dr;
          if (c < 0 || c > 3 || r < 0 || r > 3) continue;
          const w = g.wgt * (dc ? fi : 1 - fi) * (dr ? fj : 1 - fj);
          T[(r * 4 + c) * 8 + b0] += w * (1 - fb);
          T[(r * 4 + c) * 8 + (b0 + 1) % 8] += w * fb;
        }
      }
      // chuẩn hoá 3 bước: ‖v‖ = 1 → kẹp 0.2 → chuẩn hoá lần nữa
      let n = 0; for (let i = 0; i < 128; i++) n += T[i] * T[i];
      n = Math.sqrt(n) || 1e-9;
      const v = Array.from(T, x => x / n);
      let clamped = 0;
      for (let i = 0; i < 128; i++) if (v[i] > 0.2) { v[i] = 0.2; clamped++; }
      n = 0; for (let i = 0; i < 128; i++) n += v[i] * v[i];
      n = Math.sqrt(n) || 1e-9;
      for (let i = 0; i < 128; i++) v[i] /= n;
      return { P, grads, v, clamped };
    }

    function get(selIdx, rot) {
      const key = selIdx + (rot ? "R" : "F");
      if (!cache[key]) cache[key] = build(kps[selIdx], rot);
      return cache[key];
    }

    function dist(a, b) {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
      return Math.sqrt(s);
    }

    function drawImg(k, rot) {
      const s = data.src, half = 30, sc = 252 / (2 * half); // crop 60×60 px quanh keypoint → 252×252
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, s.gray, s.w, s.h);
      cImg.imageSmoothingEnabled = false;
      cImg.fillStyle = "#0F2B46"; cImg.fillRect(0, 0, 252, 252);
      const sx = Math.max(0, Math.min(s.w - 2 * half, k.x - half));
      const sy = Math.max(0, Math.min(s.h - 2 * half, k.y - half));
      cImg.drawImage(tmp, sx, sy, 2 * half, 2 * half, (sx - (k.x - half)) * sc, (sy - (k.y - half)) * sc, 2 * half * sc, 2 * half * sc);
      const X = (u, v) => ((k.x + u * Math.cos(th) + v * Math.sin(th)) - sx) * sc;
      const Y = (u, v) => ((k.y - u * Math.sin(th) + v * Math.cos(th)) - sy) * sc;
      const th = (rot ? k.theta : 0) * Math.PI / 180;
      const cx = (k.x - sx) * sc, cy = (k.y - sy) * sc;
      cImg.strokeStyle = "#E02424"; cImg.lineWidth = 2;
      cImg.beginPath();
      [[-8, -8], [8, -8], [8, 8], [-8, 8]].forEach((p, i) => {
        const px = X(p[0], p[1]), py = Y(p[0], p[1]);
        i ? cImg.lineTo(px, py) : cImg.moveTo(px, py);
      });
      cImg.closePath(); cImg.stroke();
      cImg.lineWidth = 1; cImg.strokeStyle = "rgba(255,255,255,.85)";
      for (const t of [-4, 0, 4]) {
        cImg.beginPath(); cImg.moveTo(X(t, -8), Y(t, -8)); cImg.lineTo(X(t, 8), Y(t, 8)); cImg.stroke();
        cImg.beginPath(); cImg.moveTo(X(-8, t), Y(-8, t)); cImg.lineTo(X(8, t), Y(8, t)); cImg.stroke();
      }
      if (rot) {
        const a = -k.theta * Math.PI / 180, len = 40;
        cImg.beginPath(); cImg.moveTo(cx, cy); cImg.lineTo(cx + len * Math.cos(a), cy + len * Math.sin(a));
        cImg.strokeStyle = "#FFD166"; cImg.lineWidth = 3; cImg.stroke();
      }
      IMG.drawCircle(cImg, cx, cy, 4, "#E02424", 2);
    }

    function drawPatch(D, rot) {
      const C = 252, M = 6, S = (C - 2 * M) / 16;
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, D.P, 16, 16);
      cPatch.imageSmoothingEnabled = false;
      cPatch.fillStyle = "#0F2B46"; cPatch.fillRect(0, 0, C, C);
      cPatch.drawImage(tmp, M, M, 16 * S, 16 * S);
      cPatch.strokeStyle = "rgba(14,159,110,.9)"; cPatch.lineWidth = 1.4;
      for (let t = 0; t <= 4; t++) {
        cPatch.beginPath(); cPatch.moveTo(M + t * 4 * S, M); cPatch.lineTo(M + t * 4 * S, C - M); cPatch.stroke();
        cPatch.beginPath(); cPatch.moveTo(M, M + t * 4 * S); cPatch.lineTo(C - M, M + t * 4 * S); cPatch.stroke();
      }
      for (const g of D.grads) {
        if (g.mag < 10) continue;
        const a = -g.ang, len = Math.min(S * 0.95, 3 + g.mag / 14);
        const px = M + (g.i + 0.5) * S, py = M + (g.j + 0.5) * S;
        cPatch.beginPath(); cPatch.moveTo(px, py);
        cPatch.lineTo(px + len * Math.cos(a), py + len * Math.sin(a));
        cPatch.strokeStyle = `hsl(${Math.round(g.ang / TAU * 360)},85%,60%)`;
        cPatch.lineWidth = 1; cPatch.stroke();
      }
      capPatch.innerHTML = rot
        ? "<b>② Patch xoay chuẩn hoá về θ = 0°</b> — lấy mẫu qua khung xoay (bilinear); mũi tên = gradient trong khung đã « trừ θ », lưới xanh = ranh giới 16 ô."
        : "<b>② Patch lấy mẫu KHÔNG xoay (θ = 0)</b> — khung lấy mẫu lệch khỏi hướng đặc trưng ⇒ gradient đổi hướng ⇒ HoG ở ③ đổi theo.";
    }

    function drawHog(D) {
      const C = 252, cell = C / 4;
      let mx = 1e-9; for (let i = 0; i < 128; i++) mx = Math.max(mx, D.v[i]);
      cHog.fillStyle = "#F8FAFD"; cHog.fillRect(0, 0, C, C);
      cHog.strokeStyle = "#D8E3F0"; cHog.lineWidth = 1.4;
      for (let t = 0; t <= 4; t++) {
        cHog.beginPath(); cHog.moveTo(t * cell, 0); cHog.lineTo(t * cell, C); cHog.stroke();
        cHog.beginPath(); cHog.moveTo(0, t * cell); cHog.lineTo(C, t * cell); cHog.stroke();
      }
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
        IMG.drawCircle(cHog, cx, cy, 2.5, "#94A3B8", 1);
        for (let b = 0; b < 8; b++) {
          const len = D.v[(r * 4 + c) * 8 + b] / mx * (cell * 0.46);
          if (len < 1) continue;
          const a = -(b * 45) * Math.PI / 180;
          cHog.beginPath(); cHog.moveTo(cx, cy);
          cHog.lineTo(cx + len * Math.cos(a), cy + len * Math.sin(a));
          cHog.strokeStyle = `hsl(${Math.round(b / 8 * 360)},80%,48%)`;
          cHog.lineWidth = 2.6; cHog.stroke();
        }
      }
    }

    function drawVec(curV, otherV, rot) {
      const CW = 880, CH = 120, x0 = 6, bw = (CW - 12) / 128, y0 = CH - 20, hMax = 82;
      cVec.clearRect(0, 0, CW, CH);
      for (let i = 0; i < 128; i++) { // ghost: chế độ còn lại
        const h = Math.max(0.5, otherV[i] * hMax);
        cVec.fillStyle = "rgba(148,163,184,.45)";
        cVec.fillRect(x0 + i * bw, y0 - h, bw - 1, h);
      }
      for (let i = 0; i < 128; i++) {
        const h = Math.max(1, curV[i] * hMax);
        cVec.fillStyle = `hsl(${215 - Math.floor(i / 8) * 11},72%,52%)`;
        cVec.fillRect(x0 + i * bw, y0 - h, bw - 1, h);
      }
      cVec.strokeStyle = "rgba(100,116,139,.6)"; cVec.lineWidth = 1;
      for (let t = 0; t <= 16; t++) {
        cVec.beginPath(); cVec.moveTo(x0 + t * 8 * bw, 8); cVec.lineTo(x0 + t * 8 * bw, y0); cVec.stroke();
      }
      cVec.fillStyle = "#64748B"; cVec.font = "11px Arial"; cVec.textAlign = "left";
      cVec.fillText("chiều 1 → 128 (16 ô × 8 hướng)", x0, CH - 4);
    }

    function render() {
      if (!data || !kps.length) return;
      const k = kps[sel];
      const cur = get(sel, mode), other = get(sel, !mode);
      drawImg(k, mode);
      drawPatch(cur, mode);
      drawHog(cur);
      drawVec(cur.v, other.v, mode);
      const d = dist(cur.v, other.v);
      mount.querySelector("#ds-kpinfo").innerHTML =
        "(x, y) = (" + k.x + ", " + k.y + ") · θ ≈ <b>" + Math.round(k.theta) + "°</b> · kẹp 0.2 ở " + cur.clamped + "/128 thành phần";
      capVec.innerHTML = mode
        ? "<b>Cột màu = v khi xoay theo θ (đúng chuẩn)</b> · xám nhạt phía sau = v nếu KHÔNG xoay — hai vector lệch nhau ‖v<sub>θ</sub> − v<sub>0</sub>‖ = <b>" + d.toFixed(3) + "</b> (thang [0, √2 ≈ 1.41]). Ảnh bị xoay mà descriptor lệch cỡ này thì matching thất bại — đó là lý do bắt buộc phải xoay theo hướng của Bước 3."
        : "<b>Bạn đang xem v<sub>0</sub> — lấy mẫu KHÔNG xoay</b> · so với v<sub>θ</sub> (xám nhạt) lệch <b>" + d.toFixed(3) + "</b>. Bật lại « xoay theo θ » để trở về descriptor ổn định khi ảnh xoay.";
    }

    getPyr().then(d => {
      data = d;
      kps = pickKps(d.ext);
      for (const k of kps) k.theta = thetaOf(k);
      const selEl = mount.querySelector("#ds-kp");
      kps.forEach((k, i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = "kp #" + (i + 1) + " — (" + k.x + ", " + k.y + "), θ≈" + Math.round(k.theta) + "°";
        selEl.appendChild(o);
      });
      render();
    });

    mount.querySelector("#ds-kp").onchange = (e) => { sel = +e.target.value; render(); };
    mount.querySelector("#ds-rot").onchange = (e) => { mode = e.target.checked; render(); };
  }
})();
