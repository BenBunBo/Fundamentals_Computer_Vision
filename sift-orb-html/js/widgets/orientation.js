/* Widget SIFT bước 3: orientation assignment walkthrough.
   5 chặng: ảnh đầu vào → keypoint → bóc cửa sổ → gradient → histogram 36 bins → θ. */
"use strict";
(() => {
  const mount = document.getElementById("w-orientation");
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

  const CAPS = [
    "<b>Bức ảnh đầu vào</b> 640×362. Qua DoG, SIFT tìm được các ứng viên keypoint (chấm xanh) — ta chọn 1 điểm để soi từng bước.",
    "<b>Bóc cửa sổ từ đúng chỗ này.</b> Cửa sổ tròn Gaussian bán kính 3·(1.5σ<sub>kp</sub>) nằm ngay tại (x, y) của keypoint trên ảnh octave 0 — pixel bạn thấy là pixel thật của bức ảnh.",
    "<b>Gradient từng pixel</b> trong cửa sổ: mũi tên = hướng θ(x, y), độ dài = độ lớn. Đây là nguyên liệu thô của histogram.",
    "<b>Histogram 36 bins</b> (mỗi bin 10°): mỗi pixel góp vào bin đúng hướng của nó với trọng số = độ lớn gradient × Gaussian(σ = 1.5σ<sub>kp</sub>).",
    "<b>θ = hướng cột peak</b> (nội suy parabola cho chính xác sub-bin). Keypoint giờ mang trọn bộ (x, y, σ, θ) — descriptor bước 4 sẽ lấy cửa sổ 16×16 <b>xoay về θ = 0°</b> quanh điểm này.",
  ];

  function init() {
    mount.innerHTML = `
      <div class="or-strip">${CAPS.map((c, i) => `<div class="or-chip" id="or-ch${i}">${["1 · Ảnh đầu vào", "2 · Keypoint (x, y, σ)", "3 · Bóc cửa sổ", "4 · Histogram 36 bins", "5 · Hướng θ"][i]}</div>`).join("")}</div>
      <div class="w-controls">
        <label>Keypoint <select id="or-kp"></select></label>
        <button class="w-btn" id="or-prev">‹</button>
        <button class="w-btn" id="or-next">Sau ›</button>
        <button class="w-btn" id="or-auto">▶ Tự động</button>
      </div>
      <div class="or-panels">
        <div>
          <canvas id="or-left" width="430" height="243"></canvas>
          <p class="or-caption" id="or-cap"></p>
        </div>
        <div>
          <canvas id="or-right" width="250" height="250"></canvas>
          <p class="or-caption" id="or-cap2" style="max-width:250px"></p>
        </div>
      </div>`;

    const left = mount.querySelector("#or-left").getContext("2d");
    const right = mount.querySelector("#or-right").getContext("2d");
    const cap = mount.querySelector("#or-cap"), cap2 = mount.querySelector("#or-cap2");
    let stage = 0, data = null, kps = [], sel = 0, anim = null, timer = null;

    function pickKps(ext) {
      const cand = ext.filter(e => e.oct === 0).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
      const out = [];
      for (const e of cand) {
        if (out.every(o => Math.hypot(o.x - e.x, o.y - e.y) > 22)) out.push(e);
        if (out.length >= 6) break;
      }
      return out;
    }

    function kpInfo(k) {
      const pyr = data.pyr;
      const sig = pyr.sigma0 * Math.pow(pyr.k, k.s + 0.5);
      const O0 = pyr.octaves[0];
      const L = O0.levels[k.s];
      const sw = 1.5 * sig, R = Math.min(18, Math.max(8, Math.round(3 * sw)));
      // gradient + histogram 36 bins (tri-linear theo góc)
      const H36 = new Float32Array(36), grads = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = k.x + dx, y = k.y + dy;
        if (x < 1 || y < 1 || x >= O0.w - 1 || y >= O0.h - 1) continue;
        const g = IMG.gradAt(L, O0.w, O0.h, x, y);
        const mag = Math.hypot(g.gx, g.gy);
        if (mag < 1e-6) continue;
        const ang = (Math.atan2(g.gy, g.gx) + Math.PI * 2) % (Math.PI * 2);
        const wgt = mag * Math.exp(-(dx * dx + dy * dy) / (2 * sw * sw));
        const f = ang / (Math.PI * 2) * 36, lo = Math.floor(f) % 36;
        H36[lo] += wgt * (1 - (f - Math.floor(f)));
        H36[(lo + 1) % 36] += wgt * (f - Math.floor(f));
        grads.push({ x: dx, y: dy, ang, mag, wgt });
      }
      let peak = 0; for (let i = 1; i < 36; i++) if (H36[i] > H36[peak]) peak = i;
      const hp = H36[peak], hm = H36[(peak + 35) % 36], hn = H36[(peak + 1) % 36];
      const den = hm - 2 * hp + hn;
      const delta = Math.abs(den) > 1e-9 ? 0.5 * (hm - hn) / den : 0;
      const theta = ((peak + 0.5 + Math.max(-0.5, Math.min(0.5, delta))) / 36) * 360;
      let nSecondary = 0;
      for (let i = 0; i < 36; i++) {
        if (i === peak) continue;
        if (H36[i] >= 0.8 * hp && H36[i] >= H36[(i + 35) % 36] && H36[i] >= H36[(i + 1) % 36]) nSecondary++;
      }
      return { sig, L, Lw: O0.w, Lh: O0.h, sw, R, H36, grads, peak, theta, nSecondary, val: k.val };
    }

    function drawLeft(showTheta) {
      const s = data.src, k = kps[sel], info = kpInfo(k);
      const scale = 430 / s.w;
      left.imageSmoothingEnabled = true;
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, s.gray, s.w, s.h);
      left.drawImage(tmp, 0, 0, 430, 243);
      // mọi ứng viên
      for (const e of data.ext) {
        if (e.oct !== 0) continue;
        left.beginPath(); left.arc(e.x * scale, e.y * scale, 2, 0, Math.PI * 2);
        left.fillStyle = "rgba(46,134,222,.55)"; left.fill();
      }
      const cx = k.x * scale, cy = k.y * scale;
      // cửa sổ vuông + tròn
      left.strokeStyle = "#FFD166"; left.lineWidth = 1.6; left.setLineDash([5, 4]);
      left.strokeRect(cx - info.R * scale, cy - info.R * scale, 2 * info.R * scale, 2 * info.R * scale);
      left.setLineDash([]);
      IMG.drawCircle(left, cx, cy, info.sw * scale, "#ffffff", 1.4);
      IMG.drawCircle(left, cx, cy, 4, "#E02424", 2);
      if (stage >= 4 || showTheta) {
        const a = -info.theta * Math.PI / 180, len = 34;
        left.beginPath(); left.moveTo(cx, cy); left.lineTo(cx + len * Math.cos(a), cy + len * Math.sin(a));
        left.strokeStyle = "#E02424"; left.lineWidth = 3; left.stroke();
        // mũi tên
        left.beginPath();
        left.arc(cx + len * Math.cos(a), cy + len * Math.sin(a), 4, a - 2.5, a + 2.5);
        left.strokeStyle = "#E02424"; left.stroke();
      }
    }

    function drawCrop(withArrows) {
      const k = kps[sel], info = kpInfo(k), L = info.L, R = info.R;
      const C = 250, size = 2 * R + 1, sc = (C - 10) / size;
      right.imageSmoothingEnabled = false;
      right.fillStyle = "#0F2B46"; right.fillRect(0, 0, C, C);
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, L, info.Lw, info.Lh);
      right.drawImage(tmp, k.x - R, k.y - R, size, size, 5, 5, C - 10, C - 10);
      // vùng Gaussian (σ_w): tô nhẹ ngoài bán kính
      const gr = right.createRadialGradient(C / 2, C / 2, info.sw * sc, C / 2, C / 2, (C - 10) / 2);
      gr.addColorStop(0, "rgba(15,43,70,0)"); gr.addColorStop(1, "rgba(15,43,70,.55)");
      right.fillStyle = gr; right.fillRect(0, 0, C, C);
      IMG.drawCircle(right, C / 2, C / 2, info.sw * sc, "#ffffff", 1.3);
      if (withArrows) {
        const step = Math.max(2, Math.round(size / 24));
        right.lineWidth = 1;
        for (const g of info.grads) {
          if (g.mag < 12 || g.x % step !== 0 || g.y % step !== 0) continue;
          const px = C / 2 + g.x * sc, py = C / 2 + g.y * sc;
          const a = -g.ang, len = Math.min(14, 2 + g.mag / 14);
          right.beginPath(); right.moveTo(px, py);
          right.lineTo(px + len * Math.cos(a), py + len * Math.sin(a));
          right.strokeStyle = "rgba(255,209,102,.85)"; right.stroke();
        }
      }
    }

    function drawHist(prog) {
      const info = kpInfo(kps[sel]);
      const C = 250, pad = 22, bw = (C - 2 * pad) / 36, max = info.H36[info.peak] || 1;
      right.clearRect(0, 0, C, C);
      right.fillStyle = "#0F2B46"; right.fillRect(0, 0, C, C);
      // trục
      right.strokeStyle = "#3E5E82"; right.beginPath();
      right.moveTo(pad, C - pad); right.lineTo(C - pad, C - pad); right.stroke();
      for (let i = 0; i < 36; i++) {
        const v = info.H36[i] / max * prog;
        const hgt = v * (C - 2 * pad - 6);
        const isPeak = i === info.peak;
        const isSecond = !isPeak && info.H36[i] >= 0.8 * max;
        right.fillStyle = isPeak ? "#7EB8F0" : (isSecond ? "#E67E22" : "#3E5E82");
        right.fillRect(pad + i * bw + 0.6, C - pad - hgt, bw - 1.2, hgt);
      }
      // nhãn 0° / 90° / 180° / 270°
      right.fillStyle = "#9FB6D0"; right.font = "10px Arial"; right.textAlign = "center";
      [["0°", 0], ["90°", 9], ["180°", 18], ["270°", 27]].forEach(([t, i]) =>
        right.fillText(t, pad + (i + 0.5) * bw, C - pad + 12));
      if (prog >= 1) {
        right.fillStyle = "#fff"; right.textAlign = "left";
        right.fillText("peak bin " + info.peak + " → θ ≈ " + Math.round(info.theta) + "°", pad, 16);
      }
    }

    function drawDial() {
      const info = kpInfo(kps[sel]);
      const C = 250, c = C / 2, r = 88;
      right.clearRect(0, 0, C, C);
      right.fillStyle = "#0F2B46"; right.fillRect(0, 0, C, C);
      IMG.drawCircle(right, c, c, r, "#3E5E82", 1.6);
      IMG.drawCircle(right, c, c, r * 0.55, "#3E5E82", 1, [4, 4]);
      right.fillStyle = "#9FB6D0"; right.font = "11px Arial"; right.textAlign = "center";
      for (let a = 0; a < 360; a += 30) {
        const rad = -a * Math.PI / 180;
        const x1 = c + r * Math.cos(rad), y1 = c + r * Math.sin(rad);
        right.fillText(a + "°", c + (r + 14) * Math.cos(rad), c + (r + 14) * Math.sin(rad) + 4);
        right.beginPath(); right.moveTo(x1, y1);
        right.lineTo(c + (r - 6) * Math.cos(rad), c + (r - 6) * Math.sin(rad));
        right.strokeStyle = "#3E5E82"; right.stroke();
      }
      // θ arrow
      const a = -info.theta * Math.PI / 180;
      right.beginPath(); right.moveTo(c, c); right.lineTo(c + (r - 4) * Math.cos(a), c + (r - 4) * Math.sin(a));
      right.strokeStyle = "#E02424"; right.lineWidth = 4; right.stroke();
      right.beginPath(); right.arc(c + (r - 4) * Math.cos(a), c + (r - 4) * Math.sin(a), 6, a - 2.4, a + 2.4);
      right.strokeStyle = "#E02424"; right.lineWidth = 4; right.stroke();
      right.fillStyle = "#fff"; right.font = "bold 13px Arial";
      right.fillText("θ ≈ " + Math.round(info.theta) + "°", c, c - 10);
      right.fillStyle = "#E67E22"; right.font = "11px Arial";
      right.fillText(info.nSecondary + " peak phụ ≥80% → thêm θ", c, c + 26);
    }

    function render() {
      mount.querySelectorAll(".or-chip").forEach((ch, i) => {
        ch.classList.toggle("cur", i === stage);
        ch.classList.toggle("done", i < stage);
      });
      cap.innerHTML = CAPS[stage];
      cap2.innerHTML = "";
      if (stage === 0) {
        drawLeft(false);
        right.fillStyle = "#0F2B46"; right.fillRect(0, 0, 250, 250);
        right.fillStyle = "#9FB6D0"; right.font = "12px Arial"; right.textAlign = "left";
        const k = kps[sel], info = kpInfo(k);
        const lines = [
          "Keypoint #" + (sel + 1),
          "x = " + k.x + " · y = " + k.y + " px",
          "σ_kp ≈ " + info.sig.toFixed(2),
          "độ nổi bật DoG: " + Math.abs(info.val).toFixed(1),
          "",
          "Chưa có hướng — mô tả vùng",
          "quanh điểm này sẽ đổi hình",
          "khi ảnh bị xoay.",
          "",
          "Cửa sổ vuông = vùng 16×16 sẽ",
          "dùng cho descriptor (bước 4).",
        ];
        lines.forEach((t, i) => right.fillText(t, 14, 24 + i * 19));
        cap2.innerHTML = "Chấm xanh: các ứng viên keypoint trên ảnh (octave 0).";
      } else if (stage === 1) {
        drawCrop(false);
        cap2.innerHTML = "Tròng trắng = vùng Gaussian thực sự góp trọng số; ngoài vùng đó bị làm mờ đi.";
      } else if (stage === 2) {
        drawCrop(true);
        cap2.innerHTML = "Mũi tên vàng: gradient (hướng + độ lớn) của từng pixel trong cửa sổ.";
      } else if (stage === 3) {
        if (anim) cancelAnimationFrame(anim);
        const t0 = performance.now();
        (function tick(t) {
          const p = Math.min(1, (t - t0) / 900);
          drawHist(p);
          if (p < 1) anim = requestAnimationFrame(tick);
        })(t0);
        cap2.innerHTML = "Cột xanh = peak · cam = bin ≥80% peak (sẽ tạo θ phụ).";
      } else {
        drawLeft(true);
        drawDial();
        cap2.innerHTML = "Keypoint mang đủ (x, y, σ, θ).";
      }
    }

    function stop() { clearInterval(timer); timer = null; mount.querySelector("#or-auto").textContent = "▶ Tự động"; }
    mount.querySelector("#or-prev").onclick = () => { stop(); stage = Math.max(0, stage - 1); render(); };
    mount.querySelector("#or-next").onclick = () => { stop(); stage = Math.min(4, stage + 1); render(); };
    mount.querySelector("#or-auto").onclick = (e) => {
      if (timer) return stop();
      if (stage === 4) stage = -1;
      e.target.textContent = "⏸ Dừng";
      timer = setInterval(() => { stage++; if (stage > 4) { stage = 4; stop(); } render(); }, 1800);
      stage++; render();
    };
    mount.querySelector("#or-kp").onchange = (e) => { sel = +e.target.value; render(); };

    getPyr().then(d => {
      data = d;
      kps = pickKps(d.ext);
      const selEl = mount.querySelector("#or-kp");
      kps.forEach((k, i) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = "kp #" + (i + 1) + " — (" + k.x + ", " + k.y + "), σ≈" +
          (d.pyr.sigma0 * Math.pow(d.pyr.k, k.s + 0.5)).toFixed(1) + ", mạnh " + Math.abs(k.val).toFixed(0);
        selEl.appendChild(o);
      });
      render();
    });
  }
})();
