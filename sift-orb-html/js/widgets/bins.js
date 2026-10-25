/* Widget SIFT bước 3 (đi sâu): vì sao 36 bins — thử số bin khác nhau trên cùng dữ liệu gradient. */
"use strict";
(() => {
  const mount = document.getElementById("w-bins");
  if (!mount) return;
  whenVisible(mount, init);

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <span style="font-size:12.5px;color:#64748B">Số bins:</span>
        ${[4, 8, 12, 18, 36, 72].map(n => `<button class="w-btn bn-n" data-n="${n}">${n}</button>`).join("")}
        <span class="w-info" id="bn-perbin"></span>
      </div>
      <div class="bn-cards">
        <div>
          <canvas id="bn-dial" width="250" height="250"></canvas>
          <p class="bn-err" id="bn-err"></p>
        </div>
        <div>
          <canvas id="bn-hist" width="560" height="250"></canvas>
          <p class="or-caption" style="max-width:560px">Cùng một cửa sổ quanh cùng keypoint — chỉ đổi <b>số bins</b>. Mũi tên xanh = hướng « thật » (nội suy mịn 72 bins); mũi tên cam = bin peak được chọn.</p>
        </div>
      </div>`;

    const dial = mount.querySelector("#bn-dial").getContext("2d");
    const hist = mount.querySelector("#bn-hist").getContext("2d");
    let N = 36, win = null;

    IMG.sample().then(s => {
      const pyr = IMG.buildSiftPyramid(s.gray, s.w, s.h);
      const ext = IMG.dogExtrema(pyr, 4.0).filter(e => e.oct === 0)
        .sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
      const k = ext[0];
      const O0 = pyr.octaves[0];
      const L = O0.levels[k.s];
      const sig = pyr.sigma0 * Math.pow(pyr.k, k.s + 0.5), sw = 1.5 * sig;
      const R = Math.min(18, Math.max(8, Math.round(3 * sw)));
      const grads = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = k.x + dx, y = k.y + dy;
        if (x < 1 || y < 1 || x >= O0.w - 1 || y >= O0.h - 1) continue;
        const g = IMG.gradAt(L, O0.w, O0.h, x, y);
        const mag = Math.hypot(g.gx, g.gy);
        if (mag < 1e-6) continue;
        grads.push({
          ang: (Math.atan2(g.gy, g.gx) + Math.PI * 2) % (Math.PI * 2),
          mag,
          wgt: mag * Math.exp(-(dx * dx + dy * dy) / (2 * sw * sw)),
        });
      }
      win = { grads };
      document.querySelectorAll(".bn-n").forEach(b => b.classList.toggle("active", +b.dataset.n === 36));
      render();
    });

    function histOf(n) {
      const H = new Float32Array(n);
      for (const g of win.grads) {
        const f = g.ang / (Math.PI * 2) * n, lo = Math.floor(f) % n;
        H[lo] += g.wgt * (1 - (f - Math.floor(f)));
        H[(lo + 1) % n] += g.wgt * (f - Math.floor(f));
      }
      return H;
    }

    function peakTheta(H) {
      let peak = 0; for (let i = 1; i < H.length; i++) if (H[i] > H[peak]) peak = i;
      const hp = H[peak], hm = H[(peak + H.length - 1) % H.length], hn = H[(peak + 1) % H.length];
      const den = hm - 2 * hp + hn;
      const d = Math.abs(den) > 1e-9 ? 0.5 * (hm - hn) / den : 0;
      return { peak, theta: ((peak + 0.5 + Math.max(-0.5, Math.min(0.5, d))) / H.length) * 360 };
    }

    function circDist(a, b) {
      const d = Math.abs(a - b) % 360;
      return Math.min(d, 360 - d);
    }

    function render() {
      if (!win) return;
      document.querySelectorAll(".bn-n").forEach(b => b.classList.toggle("active", +b.dataset.n === N));
      const deg = 360 / N;
      const HN = histOf(N), H72 = histOf(72);
      const trueT = peakTheta(H72).theta;
      const pk = peakTheta(HN);
      const center = (pk.peak + 0.5) * deg;
      const err = circDist(trueT, center);

      mount.querySelector("#bn-perbin").innerHTML = "mỗi bin = 360° ÷ " + N + " = <b>" + deg.toFixed(1) + "°</b>" + (N === 36 ? " — lựa chọn của paper" : "");
      mount.querySelector("#bn-err").innerHTML =
        "θ thật ≈ <b>" + trueT.toFixed(1) + "°</b> · bin peak chọn " + center.toFixed(1) + "° · lệch <b>" + err.toFixed(1) + "°</b>" +
        (N === 36 ? " (lỗi tối đa ±5°, nội suy parabola đưa về ±1–2°)" : " (lỗi tối đa ±" + (deg / 2).toFixed(1) + "°)");

      // ---- histogram
      const C = { w: 560, h: 250 }, pad = 24, bw = (C.w - 2 * pad) / N, max = HN[pk.peak] || 1;
      hist.clearRect(0, 0, C.w, C.h);
      hist.fillStyle = "#0F2B46"; hist.fillRect(0, 0, C.w, C.h);
      hist.strokeStyle = "#3E5E82"; hist.beginPath();
      hist.moveTo(pad, C.h - pad); hist.lineTo(C.w - pad, C.h - pad); hist.stroke();
      for (let i = 0; i < N; i++) {
        const hgt = (HN[i] / max) * (C.h - 2 * pad - 4);
        hist.fillStyle = i === pk.peak ? "#7EB8F0" : "#3E5E82";
        hist.fillRect(pad + i * bw + 0.7, C.h - pad - hgt, bw - 1.4, hgt);
      }
      hist.fillStyle = "#9FB6D0"; hist.font = "10px Arial"; hist.textAlign = "center";
      [[0, 0], [90, 0.25], [180, 0.5], [270, 0.75], ["", 1]].forEach(([t, f]) => {
        hist.fillText(String(t), pad + f * (C.w - 2 * pad), C.h - pad + 13);
      });
      hist.fillStyle = "#fff"; hist.textAlign = "left"; hist.font = "12px Arial";
      hist.fillText(N + " bins — cột cao nhất = hướng chủ đạo", pad, 16);

      // ---- dial
      const dc = 125, r = 86;
      dial.clearRect(0, 0, 250, 250);
      dial.fillStyle = "#0F2B46"; dial.fillRect(0, 0, 250, 250);
      IMG.drawCircle(dial, dc, dc, r, "#3E5E82", 1.5);
      dial.fillStyle = "#9FB6D0"; dial.font = "10px Arial"; dial.textAlign = "center";
      for (let a = 0; a < 360; a += 30) {
        const rad = -a * Math.PI / 180;
        dial.fillText(a + "°", dc + (r + 14) * Math.cos(rad), dc + (r + 14) * Math.sin(rad) + 3);
      }
      // các ranh giới bin hiện tại
      for (let i = 0; i < N; i++) {
        const rad = -(i * deg) * Math.PI / 180;
        dial.beginPath(); dial.moveTo(dc + r * 0.55 * Math.cos(rad), dc + r * 0.55 * Math.sin(rad));
        dial.lineTo(dc + r * Math.cos(rad), dc + r * Math.sin(rad));
        dial.strokeStyle = "rgba(148,163,184,.4)"; dial.lineWidth = 1; dial.stroke();
      }
      const arrow = (ang, color, len) => {
        const a = -ang * Math.PI / 180;
        dial.beginPath(); dial.moveTo(dc, dc);
        dial.lineTo(dc + len * Math.cos(a), dc + len * Math.sin(a));
        dial.strokeStyle = color; dial.lineWidth = 4; dial.stroke();
        dial.beginPath(); dial.arc(dc + len * Math.cos(a), dc + len * Math.sin(a), 5, a - 2.4, a + 2.4);
        dial.stroke();
      };
      arrow(trueT, "#7EB8F0", r - 6);
      arrow(center, "#E67E22", r - 20);
    }

    document.querySelectorAll(".bn-n").forEach(b => b.onclick = () => { N = +b.dataset.n; render(); });
  }
})();
