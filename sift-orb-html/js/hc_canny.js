/* Widgets trang CANNY edge detector — 5 widget, mọi số đều tính thật từ ảnh mẫu:
   1. w-hc-1d     — cạnh 1D + nhiễu: sai phân thô vs đạo hàm Gaussian, SNR đo trực tiếp
   2. w-hc-stages — khám phá từng giai đoạn: blur / Ix / Iy / |∇I| / θ (σ kéo được)
   3. w-hc-nms    — soi NMS: lưới 9×9, hướng gradient, 2 láng giềng bị so, phán giữ/loại
   4. w-hc-hyst   — ngưỡng kép + hysteresis: phân loại strong/weak + BFS lan truyền (có chế độ chậm)
   5. w-hc-canny  — pipeline đầy đủ: 5 giai đoạn + đối chiếu OpenCV
   Pipeline khớp bản Python trong scripts/generate_hc_assets.py (Sobel replicate, NMS 4-sector
   với luật quyết hoà như nhau, hysteresis 8-láng giềng). */
"use strict";
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtI = v => Math.round(v).toLocaleString("vi-VN");

  // ---------------------------------------------------------------- PRNG (tái lập được)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeGauss(rng) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0, s2 = 0;
      do { u = rng() * 2 - 1; v = rng() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
      const f = Math.sqrt(-2 * Math.log(s2) / s2);
      spare = v * f;
      return u * f;
    };
  }

  // ---------------------------------------------------------------- pipeline Canny dùng chung
  function sobelMaps(b, w, h) {
    const gx = new Float64Array(w * h), gy = new Float64Array(w * h);
    const at = (x, y) => b[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        gx[y * w + x] = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
                      - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
        gy[y * w + x] = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
                      - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      }
    }
    return { gx, gy };
  }
  function magOf(gx, gy, l2) {
    const m = new Float64Array(gx.length);
    if (l2) for (let i = 0; i < m.length; i++) m[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    else for (let i = 0; i < m.length; i++) m[i] = Math.abs(gx[i]) + Math.abs(gy[i]);
    return m;
  }
  // NMS 4-sector — luật giống hệt Python: giữ nếu >= cả 2 phía và > ít nhất 1 phía
  function nmsOf(gx, gy, mag, w, h) {
    const keep = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const a = mag[row + x];
        if (a === 0) continue;
        const gxc = gx[row + x], gyc = gy[row + x];
        let ang = Math.atan2(gyc, gxc) * 180 / Math.PI;
        if (ang < 0) ang += 180;
        let n1, n2;
        if (ang < 22.5 || ang >= 157.5) { n1 = mag[row + x - 1]; n2 = mag[row + x + 1]; }
        else if (ang < 67.5) {
          if (gxc * gyc > 0) { n1 = mag[row - w + x - 1]; n2 = mag[row + w + x + 1]; }
          else { n1 = mag[row - w + x + 1]; n2 = mag[row + w + x - 1]; }
        } else if (ang < 112.5) { n1 = mag[row - w + x]; n2 = mag[row + w + x]; }
        else {
          if (gxc * gyc > 0) { n1 = mag[row - w + x + 1]; n2 = mag[row + w + x - 1]; }
          else { n1 = mag[row - w + x - 1]; n2 = mag[row + w + x + 1]; }
        }
        if (a >= n1 && a >= n2 && (a > n1 || a > n2)) keep[row + x] = 1;
      }
    }
    return keep;
  }
  function hystOf(keep, mag, w, h, tLow, tHigh) {
    const strong = new Uint8Array(w * h), weak = new Uint8Array(w * h), edge = new Uint8Array(w * h);
    const q = [];
    let nS = 0, nW = 0;
    for (let i = 0; i < w * h; i++) {
      if (!keep[i]) continue;
      const m = mag[i];
      if (m >= tHigh) { strong[i] = 1; edge[i] = 1; q.push(i); nS++; }
      else if (m >= tLow) { weak[i] = 1; nW++; }
    }
    let head = 0;
    while (head < q.length) {
      const i = q[head++];
      const y = (i / w) | 0, x = i - y * w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (weak[j] && !edge[j]) { edge[j] = 1; q.push(j); }
        }
      }
    }
    return { strong, weak, edge, nStrong: nS, nWeak: nW, nEdge: q.length, order: q };
  }

  // cache (blur, gx, gy) theo σ — mag/keep tính lại nhanh khi đổi L1/L2
  let baseSigma = null, baseData = null, baseP = null;
  function getBase(sigma) {
    if (baseSigma === sigma && baseData) return Promise.resolve(baseData);
    if (baseP && baseSigma === sigma) return baseP;
    baseSigma = sigma;
    baseP = IMG.sample().then(img => {
      const t0 = performance.now();
      const blur = IMG.gaussBlur(img.gray, img.w, img.h, sigma);
      const t1 = performance.now();
      const { gx, gy } = sobelMaps(blur, img.w, img.h);
      baseData = { img, blur, gx, gy, tBlur: t1 - t0, tSobel: performance.now() - t1 };
      return baseData;
    });
    return baseP;
  }

  // ---------------------------------------------------------------- helpers vẽ
  function nativeGray(vals, w, h, map) { // map: 0..1 → [r,g,b]
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const im = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const c = map(vals[i]);
      im.data[4 * i] = c[0]; im.data[4 * i + 1] = c[1]; im.data[4 * i + 2] = c[2]; im.data[4 * i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return cv;
  }
  const gray255 = v => { const c = clamp(v, 0, 255); return [c, c, c]; };
  function rampRGB(stops, t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        return [Math.round(c0[0] + (c1[0] - c0[0]) * u), Math.round(c0[1] + (c1[1] - c0[1]) * u), Math.round(c0[2] + (c1[2] - c0[2]) * u)];
      }
    }
    return stops[stops.length - 1][1];
  }
  const divRGB = (v, m) => { // −m..m → xanh(−)/trắng(0)/đỏ(+)
    const t = clamp(v / (m || 1), -1, 1);
    return t >= 0 ? rampRGB([[0, [255, 255, 255]], [1, [214, 39, 40]]], t) : rampRGB([[0, [255, 255, 255]], [1, [33, 102, 192]]], -t);
  };
  const fireRGB = t => rampRGB([[0, [0, 0, 0]], [0.4, [140, 28, 28]], [0.7, [240, 140, 40]], [1, [255, 242, 190]]], t);
  function hsv2rgb(h, s, v) { // h 0..360
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function blit(canvas, nat) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(nat, 0, 0, canvas.width, canvas.height);
  }
  function posOf(e, canvas, img) {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) * img.w / canvas.width, 0, img.w - 1),
      y: clamp((e.clientY - r.top) * img.h / canvas.height, 0, img.h - 1),
    };
  }
  const LABELS = { strong: "cạnh mạnh", diag: "cạnh chéo", weak: "điểm yếu / nhiễu" };

  /* ================================================================
     WIDGET 1 — cạnh 1D + nhiễu: sai phân thô vs đạo hàm Gaussian
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-1d");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>Nhiễu σ<sub>n</sub> = <input type="range" id="c1-noise" min="0" max="30" step="1" value="12"><b id="c1-nv" style="font-size:13px;color:#0F2B46">12</b></label>
          <label>σ của G′ = <input type="range" id="c1-sig" min="0.4" max="6" step="0.1" value="1.4"><b id="c1-sv" style="font-size:13px;color:#0F2B46">1.4</b></label>
          <button class="w-btn" id="c1-reseed">⟳ đổi hạt nhiễu</button>
          <span class="w-info" id="c1-info"></span>
        </div>
        <canvas id="c1-plot" width="640" height="300"></canvas>
        <div class="ha-legend">Trên: tín hiệu = bậc thang A = 80 + nhiễu trắng Gaussian (mỗi lần kéo slider = hạt mới) · Dưới: 2 đáp ứng, <b style="color:#2E86DE">xanh = sai phân trung tâm thô</b>, <b style="color:#0E9F6E">xanh lá = đạo hàm Gaussian G′</b> (mỗi đường chuẩn hoá theo max riêng để so hình dạng) — đường dọc đứt = vị trí cạnh thật</div>`;

      const N = 240, EDGE = 120, A = 80, B0 = 100, B1 = 180;
      const plot = mount.querySelector("#c1-plot").getContext("2d");
      let seed = 1, profile = new Float64Array(N);

      function regenerate() {
        const rng = mulberry32(seed * 7919 + 13);
        const gauss = makeGauss(rng);
        const sn = +mount.querySelector("#c1-noise").value;
        for (let i = 0; i < N; i++) profile[i] = (i < EDGE ? B0 : B1) + gauss() * sn;
      }
      function gaussDerivKernel(sigma) {
        const r = Math.max(1, Math.ceil(3 * sigma));
        const k = new Float64Array(2 * r + 1);
        let s = 0;
        for (let i = -r; i <= r; i++) { const g = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = g; s += g; }
        for (let i = 0; i < k.length; i++) k[i] /= s;
        for (let i = -r; i <= r; i++) k[i + r] *= -i / (sigma * sigma); // G′(x) = −x/σ²·G(x)
        return { k, r };
      }
      function convClamp(src, k, r) {
        const out = new Float64Array(src.length);
        for (let i = 0; i < src.length; i++) {
          let a = 0;
          for (let j = -r; j <= r; j++) a += src[clamp(i + j, 0, src.length - 1)] * k[j + r];
          out[i] = a;
        }
        return out;
      }
      function snrOf(resp) {
        let peak = 0;
        for (let i = EDGE - 10; i <= EDGE + 10; i++) peak = Math.max(peak, Math.abs(resp[i]));
        let s = 0, s2 = 0, n = 0;
        for (let i = 15; i < N - 15; i++) {
          if (Math.abs(i - EDGE) < 25) continue;
          s += resp[i]; s2 += resp[i] * resp[i]; n++;
        }
        const mean = s / n, sd = Math.sqrt(Math.max(1e-9, s2 / n - mean * mean));
        return { peak, sd, snr: sd < 1e-6 ? 1e9 : peak / sd };
      }

      function render() {
        regenerate();
        const sigma = +mount.querySelector("#c1-sig").value;
        const cd = new Float64Array(N);
        for (let i = 0; i < N; i++) cd[i] = (profile[clamp(i + 1, 0, N - 1)] - profile[clamp(i - 1, 0, N - 1)]) / 2;
        const { k, r } = gaussDerivKernel(sigma);
        const gd = convClamp(profile, k, r);
        const sCd = snrOf(cd), sGd = snrOf(gd);
        const fmtSnr = s => s.snr > 5e5 ? "∞" : s.snr.toFixed(1);
        mount.querySelector("#c1-nv").textContent = mount.querySelector("#c1-noise").value;
        mount.querySelector("#c1-sv").textContent = sigma.toFixed(1);
        mount.querySelector("#c1-info").innerHTML =
          "SNR đo từ dữ liệu — sai phân thô: <b style='color:#2E86DE'>" + fmtSnr(sCd) + "</b> · G′: <b style='color:#0E9F6E'>" + fmtSnr(sGd) + "</b>" +
          (sGd.snr > sCd.snr ? " ⇒ G′ thắng " + (sGd.snr / sCd.snr).toFixed(1) + "×" : " ⇒ σ quá nhỏ / nhiễu quá nhẹ — tăng σ hoặc σ<sub>n</sub>");

        // vẽ
        plot.fillStyle = "#fff"; plot.fillRect(0, 0, 640, 300);
        const X = i => 34 + i / (N - 1) * (640 - 44);
        // profile
        const pTop = 12, pH = 108, pMin = 55, pMax = 225;
        const Yp = v => pTop + (pMax - v) / (pMax - pMin) * pH;
        plot.strokeStyle = "#EEF3F9";
        for (const v of [75, 125, 175]) { plot.beginPath(); plot.moveTo(34, Yp(v)); plot.lineTo(640 - 10, Yp(v)); plot.stroke(); }
        plot.strokeStyle = "#64748B"; plot.lineWidth = 1.2;
        plot.beginPath();
        for (let i = 0; i < N; i++) { const x = X(i), y = Yp(profile[i]); i ? plot.lineTo(x, y) : plot.moveTo(x, y); }
        plot.stroke();
        plot.setLineDash([5, 4]); plot.strokeStyle = "#E02424"; plot.lineWidth = 1.4;
        plot.beginPath(); plot.moveTo(X(EDGE), pTop); plot.lineTo(X(EDGE), pTop + pH); plot.stroke();
        plot.setLineDash([]);
        plot.fillStyle = "#94A3B8"; plot.font = "11px Arial"; plot.textAlign = "left";
        plot.fillText("tín hiệu I(x): bậc thang A = 80 + nhiễu σₙ", 40, pTop + 14);
        // responses
        const rTop = 158, rH = 116;
        const maxCd = Math.max(1e-9, ...Array.from(cd, Math.abs));
        const maxGd = Math.max(1e-9, ...Array.from(gd, Math.abs));
        const Yr = v => rTop + rH / 2 - v / 1.05 * rH / 2;
        plot.strokeStyle = "#EEF3F9"; plot.beginPath(); plot.moveTo(34, rTop + rH / 2); plot.lineTo(640 - 10, rTop + rH / 2); plot.stroke();
        const curve = (resp, max, color, width) => {
          plot.strokeStyle = color; plot.lineWidth = width;
          plot.beginPath();
          for (let i = 0; i < N; i++) { const x = X(i), y = Yr(resp[i] / max); i ? plot.lineTo(x, y) : plot.moveTo(x, y); }
          plot.stroke();
        };
        curve(cd, maxCd, "#2E86DE", 1.5);
        curve(gd, maxGd, "#0E9F6E", 2.2);
        plot.setLineDash([5, 4]); plot.strokeStyle = "#E02424"; plot.lineWidth = 1.2;
        plot.beginPath(); plot.moveTo(X(EDGE), rTop); plot.lineTo(X(EDGE), rTop + rH); plot.stroke();
        plot.setLineDash([]);
        plot.fillStyle = "#94A3B8";
        plot.fillText("đáp ứng (chuẩn hoá từng đường theo max riêng)", 40, rTop + 14);
        plot.fillStyle = "#2E86DE"; plot.fillText("— sai phân thô", 380, rTop + 14);
        plot.fillStyle = "#0E9F6E"; plot.fillText("— G′ (σ = " + sigma.toFixed(1) + ")", 475, rTop + 14);
      }

      ["#c1-noise", "#c1-sig"].forEach(id => mount.querySelector(id).oninput = render);
      mount.querySelector("#c1-reseed").onclick = () => { seed++; render(); };
      render();
    }
  })();

  /* ================================================================
     WIDGET 2 — từng giai đoạn 2D: blur / Ix / Iy / |∇I| / θ
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-stages");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>σ = <input type="range" id="c2-sig" min="0.4" max="4" step="0.1" value="1.4"><b id="c2-sv" style="font-size:13px;color:#0F2B46">1.4</b></label>
          <button class="w-btn c2-stage active" data-s="blur">Ảnh mượt</button>
          <button class="w-btn c2-stage" data-s="gx">I<sub>x</sub></button>
          <button class="w-btn c2-stage" data-s="gy">I<sub>y</sub></button>
          <button class="w-btn c2-stage" data-s="mag">|∇I| (L2)</button>
          <button class="w-btn c2-stage" data-s="ang">Hướng θ</button>
          <span class="w-info" id="c2-stats"></span>
        </div>
        <div class="w-canvas-wrap">
          <canvas id="c2-main" width="430" height="243"></canvas>
          <div style="flex:1;min-width:280px">
            <div id="c2-kernels"></div>
            <div class="card" style="padding:9px 12px;margin-top:8px">
              <b style="font-size:12.5px">Chi phí separable</b>
              <p style="font-size:12px;margin:2px 0 0" id="c2-cost"></p>
            </div>
          </div>
        </div>`;

      const main = mount.querySelector("#c2-main");
      let stage = "blur", sigma = 1.4, base = null, p95 = 1, magMax = 1;

      function load() {
        getBase(sigma).then(b => {
          base = b;
          const { gx, gy } = b;
          const mags = magOf(gx, gy, true);
          const sorted = mags.slice().sort();
          magMax = sorted[sorted.length - 1];
          p95 = sorted[Math.floor(sorted.length * 0.95)];
          render();
        });
      }
      function render() {
        if (!base) return;
        const { img, blur, gx, gy } = base, w = img.w, h = img.h;
        let nat;
        if (stage === "blur") nat = nativeGray(blur, w, h, gray255);
        else if (stage === "gx" || stage === "gy") {
          const src = stage === "gx" ? gx : gy;
          let m = 1e-9;
          for (let i = 0; i < src.length; i++) m = Math.max(m, Math.abs(src[i]));
          nat = nativeGray(src, w, h, v => divRGB(v, m));
        } else if (stage === "mag") {
          nat = nativeGray(magOf(gx, gy, true), w, h, v => fireRGB(v / magMax));
        } else {
          nat = nativeGray(new Float64Array(w * h), w, h, () => [22, 32, 44]);
          const ctx = nat.getContext("2d");
          const im = ctx.getImageData(0, 0, w, h);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const m = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
            if (m < 15) { im.data[4 * i] = 227; im.data[4 * i + 1] = 232; im.data[4 * i + 2] = 240; continue; }
            let ang = Math.atan2(gy[i], gx[i]) * 180 / Math.PI;
            if (ang < 0) ang += 180;
            const c = hsv2rgb(ang / 180 * 330 + 10, 0.85, clamp(0.35 + 0.65 * m / p95, 0, 1));
            im.data[4 * i] = c[0]; im.data[4 * i + 1] = c[1]; im.data[4 * i + 2] = c[2];
          }
          ctx.putImageData(im, 0, 0);
        }
        blit(main, nat);
        const names = { blur: "ảnh sau Gaussian σ = " + sigma.toFixed(1), gx: "Iₓ — đạo hàm theo x (đỏ +, xanh −)", gy: "I_y — đạo hàm theo y", mag: "|∇I| = √(Iₓ² + I_y²)", ang: "θ = atan2(I_y, Iₓ) — màu = hướng (chỉ nơi |∇I| > 15)" };
        mount.querySelector("#c2-stats").innerHTML = "<b>" + names[stage] + "</b>" + (stage === "mag" || stage === "ang" ? " · max |∇I| = " + magMax.toFixed(0) + " · p95 = " + p95.toFixed(0) : "");

        // kernel 1D — tính ĐÚNG kernel đang dùng (r = ⌈3σ⌉, chuẩn hoá trên toàn bộ taps), hiển thị 7 taps giữa
        const r = Math.max(1, Math.ceil(3 * sigma));
        const kf = new Float64Array(2 * r + 1);
        let s = 0;
        for (let i = -r; i <= r; i++) { kf[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += kf[i + r]; }
        for (let i = 0; i < kf.length; i++) kf[i] /= s;
        const g = [], gp = [];
        for (let i = -3; i <= 3; i++) { g.push(kf[i + r]); gp.push(-i / (sigma * sigma) * kf[i + r]); }
        const row = (arr, cls) => "<tr>" + arr.map(v => "<td class='" + (cls || "") + "'>" + (v >= 0 ? "&nbsp;" : "−") + Math.abs(v).toFixed(3) + "</td>").join("") + "</tr>";
        mount.querySelector("#c2-kernels").innerHTML =
          "<div class='tb-mat' style='display:inline-block'><small>kernel G chuẩn hoá — 7 taps giữa (kernel thật " + (2 * r + 1) + " taps, r = ⌈3σ⌉ = " + r + ")</small><table class='mat'>" + row(g) + "</table></div>" +
          "<div class='tb-mat' style='display:inline-block;margin-left:10px'><small>kernel G′ = −x/σ²·G (lẻ, tổng ≈ 0)</small><table class='mat'>" + row(gp) + "</table></div>";
        const K = 2 * r + 1;
        mount.querySelector("#c2-cost").innerHTML = "Chập 2D thô: K² = " + (K * K) + " phép nhân/pixel · separable (chập G′ theo x rồi G theo y): <b>2K = " + (2 * K) + "</b> — tiết kiệm " + (K / 2).toFixed(1) + "×. Thời gian thực tế trên ảnh này: blur " + base.tBlur.toFixed(0) + " ms, Sobel " + base.tSobel.toFixed(0) + " ms.";
      }
      mount.querySelector("#c2-sig").oninput = e => {
        sigma = +e.target.value;
        mount.querySelector("#c2-sv").textContent = sigma.toFixed(1);
        load();
      };
      mount.querySelectorAll(".c2-stage").forEach(b => b.onclick = () => {
        mount.querySelectorAll(".c2-stage").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        stage = b.dataset.s;
        render();
      });
      load();
    }
  })();

  /* ================================================================
     WIDGET 3 — soi NMS: 1 pixel, 2 láng giềng, phán quyết
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-nms");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <button class="w-btn c3-pin" data-pin="strong">Mẫu: cạnh mạnh</button>
          <button class="w-btn c3-pin" data-pin="diag">Mẫu: cạnh chéo</button>
          <button class="w-btn c3-pin" data-pin="weak">Mẫu: điểm yếu / nhiễu</button>
          <span class="w-info" id="c3-pos"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="c3-img" width="430" height="243" style="cursor:crosshair"></canvas>
            <div class="ha-legend"><b>|∇I| (L2) sau blur σ = 1.4</b> — sáng = gradient mạnh · <b>re chuột</b> lên đây để soi pixel bất kỳ, <b>bấm</b> để ghim</div></div>
          <div><canvas id="c3-patch" width="244" height="244"></canvas>
            <div class="ha-legend">Lưới 9×9 quanh pixel — số = |∇I| · viền cam = pixel xét · viền xanh = 2 láng giềng theo hướng gradient · mũi tên = hướng θ</div></div>
          <div style="width:240px;flex:none">
            <div class="card" style="padding:10px 12px">
              <b style="font-size:13px">Phán quyết</b>
              <div class="ht-nums" id="c3-verdict"></div>
            </div>
            <div class="card" style="padding:10px 12px;margin-top:10px">
              <b style="font-size:13px">4 sector lượng tử hoá</b>
              <p style="font-size:11.5px;margin:2px 0 0;line-height:1.6">
                [0°,22.5°)∪[157.5°,180°) → trái/phải<br>
                [22.5°,67.5°) → chéo 45° hoặc 135°<br>
                [67.5°,112.5°) → trên/dưới<br>
                [112.5°,157.5°) → chéo còn lại</p>
            </div>
          </div>
        </div>
        <div class="w-canvas-wrap" style="margin-top:12px">
          <div><canvas id="c3-before" width="300" height="169"></canvas><div class="ha-legend">trước NMS — dải gradient dày</div></div>
          <div><canvas id="c3-after" width="300" height="169"></canvas><div class="ha-legend">sau NMS — sống lưng 1px (trên nền đen)</div></div>
          <div style="flex:1;min-width:220px" class="card"><b style="font-size:13px">Đếm</b><div class="ht-nums" id="c3-counts"></div></div>
        </div>`;

      const SIGMA = 1.4;
      const cImg = mount.querySelector("#c3-img").getContext("2d");
      let base = null, mag = null, keep = null, magMax = 1, p55 = 0, diagMax = 0, diagPt = null, strongPt = null, weakPt = null;
      let cur = null, pinned = null;

      getBase(SIGMA).then(b => {
        base = b;
        const { img, gx, gy } = base;
        mag = magOf(gx, gy, true);
        keep = nmsOf(gx, gy, mag, img.w, img.h);
        const sorted = mag.slice().sort();
        magMax = sorted[sorted.length - 1];
        p55 = sorted[Math.floor(sorted.length * 0.55)];
        for (let y = 3; y < img.h - 3; y++) for (let x = 3; x < img.w - 3; x++) {
          const i = y * img.w + x;
          const ad = Math.abs(gx[i] * gy[i]);
          if (ad > diagMax) { diagMax = ad; diagPt = { x, y }; }
          if (mag[i] === magMax && !strongPt) strongPt = { x, y };
        }
        // điểm yếu: gần p55, đủ gần tâm ảnh để lưới 9×9 không chạm biên
        outer:
        for (let y = 40; y < img.h - 40; y += 3) for (let x = 40; x < img.w - 40; x += 3) {
          if (Math.abs(mag[y * img.w + x] - p55) < 0.5) { weakPt = { x, y }; break outer; }
        }
        renderPick(diagPt, "cạnh chéo");
        drawOverview();
      });

      function drawOverview() {
        const { img } = base;
        blit(cImg.canvas, nativeGray(mag, img.w, img.h, v => gray255(v / magMax * 255)));
        if (cur) {
          const sc = 430 / img.w;
          IMG.drawCircle(cImg, cur.x * sc, cur.y * sc, 7, "#E67E22", 2);
          IMG.drawCircle(cImg, cur.x * sc, cur.y * sc, 1.6, "#E67E22", 2);
        }
        // before/after
        const { w, h } = base.img;
        blit(mount.querySelector("#c3-before"), nativeGray(mag, w, h, v => gray255(v / magMax * 255)));
        blit(mount.querySelector("#c3-after"), nativeGray(keep, w, h, v => v ? [255, 255, 255] : [8, 12, 20]));
        let nK = 0;
        for (let i = 0; i < keep.length; i++) nK += keep[i];
        mount.querySelector("#c3-counts").innerHTML =
          "|∇I| &gt; 0: <b>" + (w * h).toLocaleString("vi-VN") + "</b> px<br>qua NMS: <b>" + nK.toLocaleString("vi-VN") + "</b> px (" + (nK / (w * h) * 100).toFixed(1) + "%)<br>giảm dày " + (magMax > 0 ? "dải 3–5px → 1px" : "");
      }

      function renderPick(pt, label) {
        if (!base) return;
        const { img, gx, gy } = base, w = img.w;
        const x = Math.round(clamp(pt.x, 4, img.w - 5)), y = Math.round(clamp(pt.y, 4, img.h - 5));
        cur = { x, y };
        const ci = y * w + x;
        const m = mag[ci], gxc = gx[ci], gyc = gy[ci];
        let ang = Math.atan2(gyc, gxc) * 180 / Math.PI;
        if (ang < 0) ang += 180;
        let n1i, n2i, sector;
        if (ang < 22.5 || ang >= 157.5) { sector = "0° (ngang)"; n1i = ci - 1; n2i = ci + 1; }
        else if (ang < 67.5) { sector = "45°/135° (chéo)"; n1i = gxc * gyc > 0 ? ci - w - 1 : ci - w + 1; n2i = gxc * gyc > 0 ? ci + w + 1 : ci + w - 1; }
        else if (ang < 112.5) { sector = "90° (dọc)"; n1i = ci - w; n2i = ci + w; }
        else { sector = "135°/45° (chéo)"; n1i = gxc * gyc > 0 ? ci - w + 1 : ci - w - 1; n2i = gxc * gyc > 0 ? ci + w - 1 : ci + w + 1; }
        const n1 = mag[n1i], n2 = mag[n2i];
        const verdict = (m >= n1 && m >= n2 && (m > n1 || m > n2));

        drawOverview();
        // lưới 9×9
        const pcv = mount.querySelector("#c3-patch").getContext("2d");
        const CELL = 26, OFF = 5;
        let lm = 1e-9;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) lm = Math.max(lm, mag[clamp(y + dy, 0, img.h - 1) * w + clamp(x + dx, 0, img.w - 1)]);
        pcv.fillStyle = "#fff"; pcv.fillRect(0, 0, 244, 244);
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const v = mag[clamp(y + dy, 0, img.h - 1) * w + clamp(x + dx, 0, img.w - 1)];
          const t = v / lm;
          const px = OFF + (dx + 4) * CELL, py = OFF + (dy + 4) * CELL;
          pcv.fillStyle = rampRGB([[0, [255, 255, 255]], [1, [60, 20, 20]]], t);
          pcv.fillRect(px, py, CELL - 1, CELL - 1);
          pcv.fillStyle = t > 0.55 ? "#fff" : "#0F2B46";
          pcv.font = "bold 9px Arial"; pcv.textAlign = "center";
          pcv.fillText(String(Math.round(v)), px + CELL / 2, py + CELL / 2 + 3);
        }
        const cellOf = i => {
          const yy = (i / w) | 0, xx = i - yy * w;
          return [OFF + (xx - (x - 4)) * CELL, OFF + (yy - (y - 4)) * CELL];
        };
        pcv.strokeStyle = "#1B5FA8"; pcv.lineWidth = 2.6;
        const [a1x, a1y] = cellOf(n1i); pcv.strokeRect(a1x, a1y, CELL - 1, CELL - 1);
        const [a2x, a2y] = cellOf(n2i); pcv.strokeRect(a2x, a2y, CELL - 1, CELL - 1);
        pcv.strokeStyle = "#E67E22"; pcv.lineWidth = 3;
        const [ccx, ccy] = cellOf(ci); pcv.strokeRect(ccx, ccy, CELL - 1, CELL - 1);
        // mũi tên hướng gradient
        const cxp = ccx + CELL / 2, cyp = ccy + CELL / 2;
        const gl = Math.hypot(gxc, gyc) || 1, L = Math.min(58, 16 + 42 * (m / lm));
        pcv.strokeStyle = "#0E9F6E"; pcv.lineWidth = 2.4;
        pcv.beginPath(); pcv.moveTo(cxp - gxc / gl * L, cyp - gyc / gl * L); pcv.lineTo(cxp + gxc / gl * L, cyp + gyc / gl * L); pcv.stroke();
        pcv.beginPath();
        pcv.moveTo(cxp + gxc / gl * L, cyp + gyc / gl * L);
        pcv.lineTo(cxp + (gxc / gl * L - gyc / gl * 6), cyp + (gyc / gl * L + gxc / gl * 6));
        pcv.lineTo(cxp + (gxc / gl * L + gyc / gl * 6), cyp + (gyc / gl * L - gxc / gl * 6));
        pcv.closePath(); pcv.fillStyle = "#0E9F6E"; pcv.fill();

        mount.querySelector("#c3-verdict").innerHTML =
          "sector θ = <b>" + sector + "</b><br>" +
          "θ chính xác = <b>" + ang.toFixed(1) + "°</b><br>" +
          "|∇I| tâm = <b>" + m.toFixed(1) + "</b><br>" +
          "n₁ = <b>" + n1.toFixed(1) + "</b> · n₂ = <b>" + n2.toFixed(1) + "</b><br>" +
          (verdict
            ? "<span class='ht-badge bg'>GIỮ</span> <small>≥ cả 2 phía (và &gt; 1 phía) — là đỉnh</small>"
            : "<span class='ht-badge be'>LOẠI</span> <small>có láng giềng dọc hướng gradient lớn hơn — không phải đỉnh</small>");
        mount.querySelector("#c3-pos").innerHTML = "đang soi (x, y) = (" + x + ", " + y + ")" + (label ? " — " + label : "") + (pinned ? " · <b>đã ghim</b>" : "");
      }

      cImg.canvas.addEventListener("mousemove", e => { if (!pinned && base) { const p = posOf(e, cImg.canvas, base.img); renderPick(p, ""); } });
      cImg.canvas.addEventListener("mouseleave", () => { if (!pinned && base && diagPt) renderPick(diagPt, "cạnh chéo"); });
      cImg.canvas.addEventListener("click", e => { if (!base) return; const p = posOf(e, cImg.canvas, base.img); pinned = { x: p.x, y: p.y }; renderPick(p, ""); });
      mount.querySelectorAll(".c3-pin").forEach(b => b.onclick = () => {
        if (!base) return;
        pinned = null;
        const pt = { strong: strongPt, diag: diagPt, weak: weakPt }[b.dataset.pin];
        renderPick(pt, LABELS[b.dataset.pin]);
      });
    }
  })();

  /* ================================================================
     WIDGET 4 — ngưỡng kép + hysteresis (có chế độ BFS chậm)
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-hyst");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>t<sub>high</sub> = <input type="range" id="c4-th" min="5" max="255" step="1" value="110"><b id="c4-thv" style="font-size:13px;color:#0F2B46">110</b></label>
          <label>t<sub>low</sub> = <input type="range" id="c4-tl" min="5" max="255" step="1" value="55"><b id="c4-tlv" style="font-size:13px;color:#0F2B46">55</b></label>
          <button class="w-btn" id="c4-play">▶ Mô phỏng lan truyền</button>
          <span class="w-info" id="c4-info"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="c4-class" width="430" height="243"></canvas>
            <div class="ha-legend"><span class="sw" style="background:#fff;border:1px solid #D8E3F0"></span> strong (≥ t<sub>high</sub>) · <span class="sw" style="background:#F59E0B"></span> weak (t<sub>low</sub> ≤ m &lt; t<sub>high</sub>) · đen = bỏ — chỉ tính trên các pixel đã qua NMS</div></div>
          <div><canvas id="c4-edge" width="430" height="243"></canvas>
            <div class="ha-legend">kết quả hysteresis: strong + weak nối được về strong (bao đóng, 8-láng giềng) — weak lẻ loi bị bỏ</div></div>
        </div>`;

      const SIGMA = 1.4;
      let base = null, mag = null, keep = null, last = null;
      const edgeCanvas = mount.querySelector("#c4-edge");

      getBase(SIGMA).then(b => {
        base = b;
        mag = magOf(base.gx, base.gy, true);
        keep = nmsOf(base.gx, base.gy, mag, base.img.w, base.img.h);
        run(false);
      });

      function params() {
        let th = +mount.querySelector("#c4-th").value;
        let tl = +mount.querySelector("#c4-tl").value;
        if (tl > th) tl = th;
        mount.querySelector("#c4-thv").textContent = th;
        mount.querySelector("#c4-tlv").textContent = tl;
        return { th, tl };
      }
      function classify() {
        const { th, tl } = params();
        return hystOf(keep, mag, base.img.w, base.img.h, tl, th);
      }
      function drawClass(res) {
        const { img } = base, w = img.w, h = img.h;
        const nat = document.createElement("canvas"); nat.width = w; nat.height = h;
        const ctx = nat.getContext("2d");
        const im = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          let c = [8, 12, 20];
          if (res.strong[i]) c = [255, 255, 255];
          else if (res.weak[i]) c = [245, 158, 11];
          im.data[4 * i] = c[0]; im.data[4 * i + 1] = c[1]; im.data[4 * i + 2] = c[2]; im.data[4 * i + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
        blit(mount.querySelector("#c4-class"), nat);
      }
      function drawEdge(res) {
        const { img } = base, w = img.w, h = img.h;
        const nat = document.createElement("canvas"); nat.width = w; nat.height = h;
        const ctx = nat.getContext("2d");
        const im = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const c = res.edge[i] ? [255, 255, 255] : [8, 12, 20];
          im.data[4 * i] = c[0]; im.data[4 * i + 1] = c[1]; im.data[4 * i + 2] = c[2]; im.data[4 * i + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
        blit(edgeCanvas, nat);
      }
      function stats(res) {
        mount.querySelector("#c4-info").innerHTML =
          "strong: <b>" + res.nStrong.toLocaleString("vi-VN") + "</b> · weak: <b>" + res.nWeak.toLocaleString("vi-VN") + "</b> · weak được cứu: <b>" + (res.nEdge - res.nStrong).toLocaleString("vi-VN") + "</b> · cạnh cuối: <b>" + res.nEdge.toLocaleString("vi-VN") + "</b>";
      }
      function run() {
        if (!base) return;
        const res = classify();
        last = res;
        drawClass(res);
        drawEdge(res);
        stats(res);
      }
      mount.querySelector("#c4-th").oninput = run;
      mount.querySelector("#c4-tl").oninput = run;

      // BFS chậm — nhìn thấy "sóng" lan từ strong qua weak
      mount.querySelector("#c4-play").onclick = () => {
        if (!base || !last) return;
        const res = classify();
        drawClass(res);
        const { img } = base, w = img.w;
        const sc = edgeCanvas.width / img.w;
        const ectx = edgeCanvas.getContext("2d");
        ectx.imageSmoothingEnabled = false;
        ectx.clearRect(0, 0, edgeCanvas.width, edgeCanvas.height);
        ectx.fillStyle = "#080C14"; ectx.fillRect(0, 0, edgeCanvas.width, edgeCanvas.height);
        ectx.fillStyle = "#fff";
        let head = 0;
        const CHUNK = 3500;
        const step = () => {
          const end = Math.min(res.order.length, head + CHUNK);
          for (; head < end; head++) {
            const i = res.order[head];
            const y = (i / w) | 0, x = i - y * w;
            ectx.fillRect(x * sc, y * sc, sc + 0.6, sc + 0.6);
          }
          if (head < res.order.length) requestAnimationFrame(step);
          else stats(res);
        };
        step();
      };
    }
  })();

  /* ================================================================
     WIDGET 5 — pipeline đầy đủ + đối chiếu OpenCV
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-canny");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>σ = <input type="range" id="c5-sig" min="0.6" max="3" step="0.1" value="1.4"><b id="c5-sv" style="font-size:13px;color:#0F2B46">1.4</b></label>
          <label>t<sub>high</sub> = <input type="range" id="c5-th" min="10" max="255" step="1" value="110"><b id="c5-thv" style="font-size:13px;color:#0F2B46">110</b></label>
          <label>t<sub>low</sub> = <input type="range" id="c5-tl" min="5" max="255" step="1" value="55"><b id="c5-tlv" style="font-size:13px;color:#0F2B46">55</b></label>
          <button class="w-btn c5-norm active" data-n="l2">L2 (chuẩn)</button>
          <button class="w-btn c5-norm" data-n="l1">L1 (mặc định OpenCV)</button>
          <span class="w-info" id="c5-info"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="c5-big" width="430" height="243"></canvas><div class="ha-legend"><b>Đầu ra cuối</b> — cạnh mảnh 1px</div></div>
          <div style="flex:1;min-width:300px">
            <div class="w-canvas-wrap" style="gap:10px">
              <div><canvas id="c5-blur" width="196" height="111"></canvas><div class="ha-legend" style="max-width:196px">① blur</div></div>
              <div><canvas id="c5-mag" width="196" height="111"></canvas><div class="ha-legend" style="max-width:196px">② |∇I|</div></div>
              <div><canvas id="c5-keep" width="196" height="111"></canvas><div class="ha-legend" style="max-width:196px">③ NMS</div></div>
              <div><canvas id="c5-cls" width="196" height="111"></canvas><div class="ha-legend" style="max-width:196px">④ strong/weak</div></div>
            </div>
            <div class="card" style="padding:9px 12px;margin-top:10px">
              <b style="font-size:12.5px">Đếm &amp; thời gian</b>
              <div class="ht-nums" id="c5-counts"></div>
            </div>
          </div>
        </div>`;

      let sigma = 1.4, l2 = true, base = null;
      const defaults = (typeof REAL_HC !== "undefined" && REAL_HC.canny) ? REAL_HC.canny : null;

      function load() {
        getBase(sigma).then(b => {
          base = b;
          run();
        });
      }
      function run() {
        if (!base) return;
        const { img, blur, gx, gy } = base, w = img.w, h = img.h;
        const t0 = performance.now();
        const mag = magOf(gx, gy, l2);
        const keep = nmsOf(gx, gy, mag, w, h);
        const t1 = performance.now();
        let th = +mount.querySelector("#c5-th").value;
        let tl = +mount.querySelector("#c5-tl").value;
        if (tl > th) tl = th;
        mount.querySelector("#c5-sv").textContent = sigma.toFixed(1);
        mount.querySelector("#c5-thv").textContent = th;
        mount.querySelector("#c5-tlv").textContent = tl;
        const res = hystOf(keep, mag, w, h, tl, th);
        const t2 = performance.now();

        blit(mount.querySelector("#c5-big"), nativeGray(res.edge, w, h, v => v ? [255, 255, 255] : [8, 12, 20]));
        blit(mount.querySelector("#c5-blur"), nativeGray(blur, w, h, gray255));
        let magMax = 1e-9;
        for (let i = 0; i < mag.length; i++) if (mag[i] > magMax) magMax = mag[i];
        blit(mount.querySelector("#c5-mag"), nativeGray(mag, w, h, v => fireRGB(v / magMax)));
        blit(mount.querySelector("#c5-keep"), nativeGray(keep, w, h, v => v ? [255, 255, 255] : [8, 12, 20]));
        const clsNat = document.createElement("canvas"); clsNat.width = w; clsNat.height = h;
        const cctx = clsNat.getContext("2d");
        const cim = cctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          let c = [8, 12, 20];
          if (res.strong[i]) c = [255, 255, 255];
          else if (res.weak[i]) c = [245, 158, 11];
          cim.data[4 * i] = c[0]; cim.data[4 * i + 1] = c[1]; cim.data[4 * i + 2] = c[2]; cim.data[4 * i + 3] = 255;
        }
        cctx.putImageData(cim, 0, 0);
        blit(mount.querySelector("#c5-cls"), clsNat);

        mount.querySelector("#c5-info").innerHTML =
          "qua NMS: <b>" + res.nStrong.toLocaleString("vi-VN") + "</b> strong + <b>" + res.nWeak.toLocaleString("vi-VN") + "</b> weak ⇒ cạnh: <b>" + res.nEdge.toLocaleString("vi-VN") + "</b>";
        mount.querySelector("#c5-counts").innerHTML =
          "blur: " + base.tBlur.toFixed(0) + " ms · Sobel+NMS: " + (t1 - t0).toFixed(0) + " ms · hysteresis: " + (t2 - t1).toFixed(0) + " ms<br>" +
          "strong " + res.nStrong.toLocaleString("vi-VN") + " · weak " + res.nWeak.toLocaleString("vi-VN") + " · được cứu " + (res.nEdge - res.nStrong).toLocaleString("vi-VN") + " · <b>cạnh cuối " + res.nEdge.toLocaleString("vi-VN") + "</b>" +
          (defaults && sigma === defaults.sigma && th === defaults.tHigh && tl === defaults.tLow && l2
            ? "<br><span style='color:#64748B'>tham số = mặc định tham chiếu ⇒ OpenCV (cùng pipeline): " + defaults.cvEdge.toLocaleString("vi-VN") + " điểm (chênh do cách quyết hoà NMS + làm tròn uint8)</span>"
            : "");
      }
      mount.querySelector("#c5-sig").oninput = e => { sigma = +e.target.value; load(); };
      ["#c5-th", "#c5-tl"].forEach(id => mount.querySelector(id).oninput = () => { if (base) run(); });
      mount.querySelectorAll(".c5-norm").forEach(b => b.onclick = () => {
        mount.querySelectorAll(".c5-norm").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        l2 = b.dataset.n === "l2";
        if (base) run();
      });
      load();
    }
  })();

  // QA: cho node test harness import các hàm thuần (browser bỏ qua — module không tồn tại)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { sobelMaps, magOf, nmsOf, hystOf, makeGauss, mulberry32 };
  }
})();
