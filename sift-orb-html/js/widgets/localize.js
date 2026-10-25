/* Widget SIFT bước 2: keypoint localization — lọc ứng viên DoG bằng 2 bộ lọc
   (tương phản |D| và edge ratio r qua Hessian 2×2) + tinh chỉnh dưới-pixel bằng
   khai triển Taylor bậc 2: x̂ = −H⁻¹·∂D. Mọi số liệu tính thật từ pyramid của ảnh mẫu. */
"use strict";
(() => {
  const mount = document.getElementById("w-localize");
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

  function hess2(d, w, x, y) { // Hessian 2×2 của DoG tại (x, y)
    const v = (dx, dy) => d[(y + dy) * w + x + dx];
    return {
      dxx: v(1, 0) + v(-1, 0) - 2 * v(0, 0),
      dyy: v(0, 1) + v(0, -1) - 2 * v(0, 0),
      dxy: (v(1, 1) + v(-1, -1) - v(1, -1) - v(-1, 1)) / 4,
      dx: (v(1, 0) - v(-1, 0)) / 2,
      dy: (v(0, 1) - v(0, -1)) / 2,
      val: v(0, 0),
    };
  }

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <label>Ngưỡng tương phản |D| (0–255): <input type="range" id="lc-c" min="2" max="25" step="1" value="8"><b id="lc-cv" style="color:#0F2B46">8</b></label>
        <label>Edge ratio r: <input type="range" id="lc-r" min="5" max="15" step="1" value="10"><b id="lc-rv" style="color:#0F2B46">10</b></label>
        <span class="w-info" id="lc-stats"></span>
      </div>
      <div class="w-canvas-wrap">
        <div>
          <canvas id="lc-all" width="430" height="243"></canvas>
          <div class="ha-legend"><span class="sw" style="background:#FFD166"></span> <b>TRƯỚC</b>: mọi cực trị DoG (ứng viên thô, gồm nhiễu + điểm trên cạnh)</div>
        </div>
        <div>
          <canvas id="lc-keep" width="430" height="243" style="cursor:crosshair"></canvas>
          <div class="ha-legend">
            <span class="sw" style="background:#0E9F6E"></span> giữ &nbsp;<span class="sw" style="background:#94A3B8"></span> loại do tương phản thấp &nbsp;<span class="sw" style="background:#E02424"></span> loại do nằm trên cạnh — <b>bấm 1 điểm để soi Taylor ↓</b>
          </div>
        </div>
      </div>
      <div class="lc-panel">
        <div>
          <canvas id="lc-parab" width="420" height="210"></canvas>
          <p class="or-caption" style="max-width:420px">Fit parabola qua 3 mẫu DoG kề nhau (x−1, x, x+1) — cực trị thật rơi <b>giữa các pixel</b>: lệch x̂ phân số. SIFT giải tương tự trong không gian (x, y, σ) 3 chiều.</p>
        </div>
        <div class="lc-mats">
          <div class="grd-mat"><small>H — Hessian 2×2 của DoG</small><div id="lc-H"></div></div>
          <div class="grd-mat"><small>∂D — gradient</small><div id="lc-dD"></div></div>
          <div class="lc-num" id="lc-num"></div>
        </div>
      </div>`;

    const cAll = mount.querySelector("#lc-all").getContext("2d");
    const cKeep = mount.querySelector("#lc-keep").getContext("2d");
    const parab = mount.querySelector("#lc-parab").getContext("2d");
    let data = null, cands = [], sel = null;

    getPyr().then(d => {
      data = d;
      cands = IMG.dogExtrema(d.pyr, 2.0);   // lấy đủ ứng viên, lọc bằng slider
      render();
      const best = keep().sort((a, b) => Math.abs(b.val) - Math.abs(a.val))[0];
      if (best) inspect(best);
    });

    function classify() {
      const c0 = +mount.querySelector("#lc-c").value, r = +mount.querySelector("#lc-r").value;
      const rth = (r + 1) * (r + 1) / r;
      return cands.map(e => {
        const dg = data.pyr.dogs[e.oct], w = dg.w;
        const H = hess2(dg.levels[e.s], w, e.x, e.y);
        const tr = H.dxx + H.dyy, det = H.dxx * H.dyy - H.dxy * H.dxy;
        let cls = "keep";
        if (Math.abs(e.val) < c0) cls = "contrast";
        else if (det <= 0 || (tr * tr) / det >= rth) cls = "edge";
        return { ...e, H, tr, det, cls };
      });
    }
    function keep() { return classify().filter(e => e.cls === "keep"); }

    function render() {
      const c0 = +mount.querySelector("#lc-c").value, r = +mount.querySelector("#lc-r").value;
      mount.querySelector("#lc-cv").textContent = c0;
      mount.querySelector("#lc-rv").textContent = r;
      if (!data) return;
      const s = data.src, sc = 430 / s.w;
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, s.gray, s.w, s.h);
      for (const ctx of [cAll, cKeep]) {
        ctx.imageSmoothingEnabled = true;
        ctx.clearRect(0, 0, 430, 243);
        ctx.drawImage(tmp, 0, 0, 430, 243);
      }
      const clsfd = classify();
      let nC = 0, nE = 0, nK = 0;
      for (const e of clsfd) {
        const px = e.x * Math.pow(2, e.oct) * sc, py = e.y * Math.pow(2, e.oct) * sc;
        const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, e.s + 0.5) * Math.pow(2, e.oct);
        cAll.fillStyle = "#FFD166";
        cAll.beginPath(); cAll.arc(px, py, 1.6, 0, Math.PI * 2); cAll.fill();
        if (e.cls === "keep") {
          nK++;
          cKeep.fillStyle = "#0E9F6E";
          IMG.drawCircle(cKeep, px, py, Math.max(2.5, sig * 0.9 * sc), "rgba(14,159,110,.8)", 1.2);
        } else if (e.cls === "contrast") { nC++; cKeep.fillStyle = "rgba(148,163,184,.85)"; }
        else { nE++; cKeep.fillStyle = "#E02424"; }
        if (e.cls !== "keep") { cKeep.beginPath(); cKeep.arc(px, py, 1.6, 0, Math.PI * 2); cKeep.fill(); }
      }
      mount.querySelector("#lc-stats").innerHTML =
        "<b>" + clsfd.length + "</b> ứng viên → loại <b>" + nC + "</b> tương phản + <b>" + nE + "</b> cạnh → <b>giữ " + nK + "</b>";
      if (sel && clsfd.length) {
        const cur = clsfd.find(e => e.x === sel.x && e.y === sel.y && e.oct === sel.oct && e.s === sel.s);
        if (cur) inspect(cur);
      }
    }
    mount.querySelector("#lc-c").oninput = render;
    mount.querySelector("#lc-r").oninput = render;

    mount.querySelector("#lc-keep").addEventListener("click", (ev) => {
      const rect = ev.target.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) / rect.width * 430 / (430 / data.src.w);
      const my = (ev.clientY - rect.top) / rect.height * 243 / (243 / data.src.h);
      let best = null, bd = Infinity;
      for (const e of keep()) {
        const px = e.x * Math.pow(2, e.oct), py = e.y * Math.pow(2, e.oct);
        const d = Math.hypot(px - mx, py - my);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd < 40) inspect(best);
    });

    function inspect(e) {
      sel = e;
      const H = e.H;
      // parabola theo trục x qua 3 mẫu
      const dg = data.pyr.dogs[e.oct], w = dg.w, d = dg.levels[e.s];
      const vm = d[e.y * w + e.x - 1], v0 = d[e.y * w + e.x], vp = d[e.y * w + e.x + 1];
      const den = vm - 2 * v0 + vp;
      const ox = Math.abs(den) > 1e-9 ? 0.5 * (vm - vp) / den : 0;
      // x̂ = −H⁻¹·∂D
      const det = H.dxx * H.dyy - H.dxy * H.dxy;
      let sx = 0, sy = 0;
      if (Math.abs(det) > 1e-9) {
        sx = -(H.dyy * H.dx - H.dxy * H.dy) / det;
        sy = -(H.dxx * H.dy - H.dxy * H.dx) / det;
      }

      // vẽ parabola
      const CW = 420, CH = 210, pad = 34;
      parab.clearRect(0, 0, CW, CH);
      parab.fillStyle = "#0F2B46"; parab.fillRect(0, 0, CW, CH);
      const f = t => { // parabola nội suy qua 3 điểm (−1,vm),(0,v0),(1,vp)
        const a = 0.5 * (vm - 2 * v0 + vp), b = 0.5 * (vp - vm), c = v0;
        return a * t * t + b * t + c;
      };
      let vmin = Math.min(vm, v0, vp, f(ox)), vmax = Math.max(vm, v0, vp, f(ox));
      if (vmax - vmin < 1e-6) { vmax += 1; vmin -= 1; }
      const vp15 = (vmax - vmin) * 0.18; vmin -= vp15; vmax += vp15; // chừa chỗ cho nhãn
      const X = t => CW / 2 + t / 1.6 * (CW / 2 - pad);
      const Y = v => CH - pad - (v - vmin) / (vmax - vmin) * (CH - 2 * pad);
      parab.strokeStyle = "#3E5E82"; parab.beginPath();
      parab.moveTo(pad, Y(0)); parab.lineTo(CW - pad, Y(0)); parab.stroke();
      for (let t = -1.6; t <= 1.601; t += 0.02) {
        const px = X(t), py = Y(f(t));
        if (t === -1.6) parab.beginPath(), parab.moveTo(px, py); else parab.lineTo(px, py);
      }
      parab.strokeStyle = "#7EB8F0"; parab.lineWidth = 2.4; parab.stroke();
      [[-1, vm, -12], [0, v0, 18], [1, vp, -12]].forEach(([t, v, dy]) => {
        parab.fillStyle = "#FFD166";
        parab.beginPath(); parab.arc(X(t), Y(v), 5, 0, Math.PI * 2); parab.fill();
        parab.fillStyle = "#9FB6D0"; parab.font = "11px Arial"; parab.textAlign = "center";
        parab.fillText((t === 0 ? "D(x)=" : (t < 0 ? "D(x−1)=" : "D(x+1)=")) + v.toFixed(1), X(t), Y(v) + dy);
      });
      // cực trị
      parab.strokeStyle = "#E02424"; parab.setLineDash([5, 4]); parab.beginPath();
      parab.moveTo(X(ox), CH - pad); parab.lineTo(X(ox), Y(f(ox))); parab.stroke(); parab.setLineDash([]);
      parab.fillStyle = "#E67E22";
      parab.beginPath(); parab.arc(X(ox), Y(f(ox)), 6, 0, Math.PI * 2); parab.fill();
      parab.fillStyle = "#fff"; parab.font = "bold 12px Arial"; parab.textAlign = "left";
      parab.fillText("cực trị x̂ = " + ox.toFixed(3), pad + 4, 20);

      // ma trận
      mount.querySelector("#lc-H").innerHTML = "<table class='mat'><tr><td>" + H.dxx.toFixed(1) + "</td><td>" + H.dxy.toFixed(1) + "</td></tr><tr><td>" + H.dxy.toFixed(1) + "</td><td>" + H.dyy.toFixed(1) + "</td></tr></table>";
      mount.querySelector("#lc-dD").innerHTML = "<table class='mat'><tr><td>" + H.dx.toFixed(2) + "</td></tr><tr><td>" + H.dy.toFixed(2) + "</td></tr></table>";
      const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, e.s + 0.5) * Math.pow(2, e.oct);
      mount.querySelector("#lc-num").innerHTML =
        "Keypoint chọn: oct " + e.oct + " · (" + e.x + ", " + e.y + ") · σ ≈ " + sig.toFixed(2) + " · D = <b>" + e.val.toFixed(1) + "</b><br>" +
        "tr²/det = <b>" + (e.det > 0 ? (e.tr * e.tr / e.det).toFixed(1) : "∞") + "</b> (ngưỡng (r+1)²/r = " + ((10 + 1) * (10 + 1) / 10).toFixed(1) + " với r = 10)<br>" +
        "x̂ = −H⁻¹·∂D = (<b>" + sx.toFixed(3) + "</b>, <b>" + sy.toFixed(3) + "</b>) pixel — vị trí dưới-pixel";
    }
  }
})();
