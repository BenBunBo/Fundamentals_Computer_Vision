/* Widget ORB bước 2: FAST → Harris — xếp hạng và giữ top-N, kèm TENSOR VIEWER:
   rê chuột / bấm lên ảnh để soi từng thành phần của M = Σ[ Ix² IxIy ; IxIy Iy² ],
   eigenvalues và R = det − κ·trace² ngay tại điểm đó (số thật từ ảnh mẫu). */
"use strict";
(() => {
  const mount = document.getElementById("w-harris");
  if (!mount) return;
  whenVisible(mount, init);

  function scoreColor(t) { // 0..1 → xanh nhạt → vàng → đỏ
    if (t < 0.5) {
      const u = t / 0.5;
      return `rgb(${Math.round(126 + (255 - 126) * u)},${Math.round(184 + (209 - 184) * u)},${Math.round(240 + (102 - 240) * u)})`;
    }
    const u = (t - 0.5) / 0.5;
    return `rgb(255,${Math.round(209 - 209 * u)},${Math.round(102 - 102 * u)})`;
  }

  function heatColor(v, m) { // -m..m → xanh(−) trắng(0) đỏ(+)
    const t = Math.max(-1, Math.min(1, v / (m || 1)));
    if (t >= 0) return `rgb(255,${Math.round(255 - 120 * t)},${Math.round(255 - 120 * t)})`;
    const u = -t;
    return `rgb(${Math.round(255 - 110 * u)},${Math.round(255 - 110 * u)},255)`;
  }

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <label>Giữ top-N: <input type="range" id="ha-n" min="10" max="600" step="10" value="200"><b id="ha-nv" style="font-size:13px;color:#0F2B46">200</b></label>
        <span class="w-info" id="ha-stats"></span>
      </div>
      <div class="w-canvas-wrap">
        <div>
          <canvas id="ha-fast" width="430" height="243" style="cursor:crosshair"></canvas>
          <div class="ha-legend"><span class="sw" style="background:#2E86DE"></span> toàn bộ keypoint FAST-9 (t = 10) — gồm cả điểm trên cạnh &amp; điểm yếu. <b>Rê chuột lên ảnh này để soi ma trận M ↓</b></div>
        </div>
        <div>
          <canvas id="ha-top" width="430" height="243"></canvas>
          <div class="ha-legend">
            <span class="sw" style="background:linear-gradient(90deg,#7EB8F0,#FFD166,#E02424)"></span> Harris response: xanh = yếu → đỏ = góc rõ · viền trắng = top-N được giữ, mờ = bị loại
          </div>
        </div>
        <div style="width:270px;flex:none">
          <div class="card" style="padding:10px 12px">
            <b style="font-size:13px">Công thức (Harris &amp; Stephens 1988)</b>
            <p style="font-family:monospace;font-size:11.5px;line-height:1.7">M = Σ<sub>w</sub> [ Ix²  IxIy ]<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[ IxIy Iy² ]<br>det = λ₁λ₂, trace = λ₁+λ₂<br><b>R = det − 0.04·trace²</b></p>
            <p style="font-size:11.5px">OpenCV (orb.cpp) tính R trong cửa sổ <b>7×7</b> quanh từng FAST keypoint, κ = 0.04 — rồi gộp mọi level pyramid và giữ top-N điểm có R cao nhất (paper: N = 500).</p>
          </div>
          <svg class="ha-svg" width="250" height="120" viewBox="0 0 250 120" role="img" aria-label="Không gian eigenvalue: phẳng, cạnh, góc">
            <rect x="34" y="6" width="205" height="90" fill="#F4F7FA" stroke="#D8E3F0"/>
            <line x1="34" y1="96" x2="239" y2="96" stroke="#94A3B8"/><line x1="34" y1="6" x2="34" y2="96" stroke="#94A3B8"/>
            <polygon points="34,96 239,6 239,96" fill="rgba(14,159,110,.14)"/>
            <polygon points="34,6 239,6 34,96" fill="rgba(214,69,69,.12)"/>
            <text x="60" y="30" font-size="10.5" fill="#64748B" font-family="Arial">cạnh (λ₁ ≫ λ₂)</text>
            <text x="150" y="88" font-size="10.5" fill="#64748B" font-family="Arial">phẳng (λ₁,λ₂ nhỏ)</text>
            <text x="165" y="26" font-size="10.5" fill="#0E9F6E" font-weight="bold" font-family="Arial">góc (λ₁,λ₂ lớn)</text>
            <text x="126" y="114" font-size="10.5" fill="#64748B" font-family="Arial">λ₁ →</text>
            <text x="8" y="55" font-size="10.5" fill="#64748B" font-family="Arial">λ₂ ↑</text>
          </svg>
          <p style="font-size:11px;color:#94A3B8">Harris chỉ <b>xếp hạng</b> điểm FAST đã có — FAST quyết định xét điểm nào, Harris quyết định giữ điểm nào.</p>
        </div>
      </div>

      <div class="ha-tensor">
        <div class="ha-tensor-head">
          <b>🔬 Soi từng ma trận của công thức — tại 1 điểm bất kỳ</b>
          <div class="w-controls" style="margin:6px 0 0">
            <button class="w-btn ha-pin" data-pin="corner">Mẫu: góc</button>
            <button class="w-btn ha-pin" data-pin="edge">Mẫu: trên cạnh</button>
            <button class="w-btn ha-pin" data-pin="flat">Mẫu: vùng phẳng</button>
            <span class="w-info" id="ha-pos"></span>
          </div>
        </div>
        <div class="ha-tensor-body">
          <div class="ha-tcell">
            <small>Cửa sổ 7×7 quanh điểm (phóng to)</small>
            <canvas id="ht-zoom" width="154" height="154"></canvas>
          </div>
          <div class="ha-tcell">
            <small>Ix — đạo hàm theo x</small>
            <canvas id="ht-ix" width="112" height="112"></canvas>
          </div>
          <div class="ha-tcell">
            <small>Iy — đạo hàm theo y</small>
            <canvas id="ht-iy" width="112" height="112"></canvas>
          </div>
          <div class="ha-tcell">
            <small>Ix·Iy — tích 2 đạo hàm</small>
            <canvas id="ht-ixiy" width="112" height="112"></canvas>
          </div>
          <div class="ha-tcell ha-tm">
            <small>Cộng cả cửa sổ (w = 1) ⇒ structure tensor</small>
            <div class="mat-wrap">
              <table class="mat" id="ht-M"></table>
            </div>
            <div class="ht-nums" id="ht-nums"></div>
            <div class="ht-eq" id="ht-eq"></div>
          </div>
          <div class="ha-tcell">
            <small>Ellipse λ₁, λ₂ (trục chính của M)</small>
            <canvas id="ht-ell" width="154" height="154"></canvas>
            <div class="ht-cls" id="ht-cls"></div>
          </div>
        </div>
        <p class="w-info" style="margin-top:8px">Ix, Iy là <b>gradient trung tâm</b> (hiệu pixel kề bên) — đúng hàm <code>gradAt</code> dùng chung cho mọi widget. M là tổng của 49 ô: <code>M = [[ΣIx², ΣIxIy], [ΣIxIy, ΣIy²]]</code>. Hai eigenvalue của M nói lên ảnh cong đều mọi hướng (góc) hay chỉ một hướng (cạnh).</p>
      </div>

      <div class="ha-pyr">
        <div class="ha-pyr-head"><b>🏔 Pyramid: bổ sung scale — FAST + Harris chạy riêng trên từng level, rồi gộp chọn điểm mạnh nhất</b></div>
        <div class="w-controls" style="margin-top:8px">
          <label>Gộp mọi level, giữ top-N: <input type="range" id="hp-n" min="100" max="800" step="50" value="500"><b id="hp-nv" style="color:#0F2B46">500</b></label>
        </div>
        <canvas id="hp-canvas" width="880" height="160"></canvas>
        <canvas id="hp-bar" width="880" height="46" style="margin-top:8px"></canvas>
        <p class="w-info" id="hp-note" style="margin-top:8px"></p>
      </div>`;

    const cFast = mount.querySelector("#ha-fast").getContext("2d");
    const cTop = mount.querySelector("#ha-top").getContext("2d");
    let pts = [], img = null, presets = null, baseFast = null;

    IMG.sample().then(s => {
      img = s;
      let t = 10;
      let p = IMG.fastDetect(s.gray, s.w, s.h, t);
      while (p.length > 1400 && t < 40) { t += 5; p = IMG.fastDetect(s.gray, s.w, s.h, t); }
      for (const q of p) q.r = IMG.harrisAt(s.gray, s.w, s.h, q.x, q.y, 7, 0.04);
      pts = p.filter(q => q.r > 0).sort((a, b) => b.r - a.r);
      const sl = mount.querySelector("#ha-n");
      sl.max = Math.max(30, Math.min(600, Math.floor(pts.length / 10) * 10));
      if (+sl.value > +sl.max) sl.value = sl.max;
      // 3 điểm mẫu: góc (R lớn nhất) · cạnh (R âm nhất trong đám FAST) · phẳng (gradient nhỏ nhất)
      let edge = p[0];
      for (const q of p) if (q.r < edge.r) edge = q;
      let flat = null, flatG = Infinity;
      for (let y = 10; y < s.h - 10; y += 6)
        for (let x = 10; x < s.w - 10; x += 6) {
          const g = IMG.gradAt(s.gray, s.w, s.h, x, y);
          const m = Math.abs(g.gx) + Math.abs(g.gy);
          if (m < flatG) { flatG = m; flat = { x, y }; }
        }
      presets = { corner: pts[0] || p[0], edge, flat };
      buildBase();
      render();
      inspect(presets.corner.x, presets.corner.y, "góc");
      buildLevels();
      hpRender();
    });

    // ---------- pyramid: FAST + Harris trên từng level (1/1.2)^ℓ rồi gộp ----------
    const LC = ["#2E86DE", "#0E9F6E", "#E67E22", "#E02424"];
    let levels = null;

    function buildLevels() {
      levels = [];
      for (let l = 0; l < 4; l++) {
        const sc = 1 / Math.pow(1.2, l);
        const nw = Math.round(img.w * sc), nh = Math.round(img.h * sc);
        let gray = img.gray;
        if (l > 0) { // resize bilinear — đúng cách ORB dựng pyramid (khác decimation ×2 của SIFT)
          const c1 = document.createElement("canvas");
          IMG.putGray(c1, img.gray, img.w, img.h);
          const c2 = document.createElement("canvas"); c2.width = nw; c2.height = nh;
          const cx2 = c2.getContext("2d", { willReadFrequently: true });
          cx2.imageSmoothingEnabled = true;
          cx2.drawImage(c1, 0, 0, nw, nh);
          const d = cx2.getImageData(0, 0, nw, nh).data;
          gray = new Float32Array(nw * nh);
          for (let i = 0; i < nw * nh; i++) gray[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
        }
        let t = 10, fpts = IMG.fastDetect(gray, nw, nh, t);
        while (fpts.length > 1500 && t < 40) { t += 5; fpts = IMG.fastDetect(gray, nw, nh, t); }
        for (const q of fpts) q.r = IMG.harrisAt(gray, nw, nh, q.x, q.y, 7, 0.04);
        const kept = fpts.filter(q => q.r > 0).sort((a, b) => b.r - a.r);
        levels.push({ l, scale: sc, w: nw, h: nh, gray, nFast: fpts.length, kept });
      }
    }

    function hpRender() {
      if (!levels) return;
      const N = +mount.querySelector("#hp-n").value;
      mount.querySelector("#hp-nv").textContent = N;
      // gộp mọi level, giữ top-N theo Harris response
      const pool = [];
      levels.forEach(L => L.kept.forEach(q => pool.push({ x: q.x, y: q.y, r: q.r, l: L.l })));
      pool.sort((a, b) => b.r - a.r);
      const top = pool.slice(0, N);
      const perLevel = levels.map(L => top.filter(q => q.l === L.l).length);
      // vẽ 4 level cạnh nhau — bề rộng tỉ lệ theo scale (pyramid thật), chấm = điểm mạnh nhất của level
      const cv = mount.querySelector("#hp-canvas").getContext("2d");
      const CH = 170, avail = 872, gap = 8, sumS = levels.reduce((a, L) => a + L.scale, 0);
      cv.fillStyle = "#fff"; cv.fillRect(0, 0, 880, CH);
      let xoff = 0;
      levels.forEach(L => {
        const dw = Math.floor(avail * L.scale / sumS) - gap;
        const dh = Math.round(dw * L.h / L.w);
        const y0 = Math.round((CH - dh) / 2);
        const tmp = document.createElement("canvas");
        IMG.putGray(tmp, L.gray, L.w, L.h);
        cv.imageSmoothingEnabled = true;
        cv.drawImage(tmp, xoff, y0, dw, dh);
        L.kept.slice(0, 200).forEach(q => {
          cv.fillStyle = LC[L.l];
          cv.beginPath(); cv.arc(xoff + q.x * dw / L.w, y0 + q.y * dh / L.h, Math.max(1.2, dw / 130), 0, Math.PI * 2); cv.fill();
        });
        cv.fillStyle = "#0F2B46"; cv.font = "bold 11px Arial"; cv.textAlign = "left";
        cv.fillText("level " + L.l + " · 1:" + (1 / L.scale).toFixed(2), xoff + 4, 13);
        cv.fillStyle = "#64748B"; cv.font = "10px Arial";
        cv.fillText(L.nFast + " FAST → " + L.kept.length + " Harris", xoff + 4, 25);
        xoff += dw + gap;
      });
      // thanh phân bố top-N theo level
      const bv = mount.querySelector("#hp-bar").getContext("2d");
      bv.clearRect(0, 0, 880, 46);
      const total = Math.max(1, top.length);
      let bx = 0;
      levels.forEach((L, i) => {
        const wpx = perLevel[i] / total * 876;
        bv.fillStyle = LC[i];
        bv.fillRect(bx, 6, Math.max(0, wpx - 2), 20);
        if (wpx > 34) {
          bv.fillStyle = "#fff"; bv.font = "bold 11px Arial"; bv.textAlign = "center";
          bv.fillText(perLevel[i], bx + wpx / 2, 20);
        }
        bx += wpx;
      });
      bv.fillStyle = "#64748B"; bv.font = "10.5px Arial"; bv.textAlign = "left";
      bv.fillText("thành phần top-" + top.length + " theo level — scale của keypoint = 1.2^level", 4, 42);
      mount.querySelector("#hp-note").innerHTML =
        "Mỗi level = ảnh resize nội suy bilinear về (1/1.2)<sup>ℓ</sup> — khác SIFT (decimation ×2) · FAST và Harris chạy <b>riêng</b> trên từng level · gộp cả 4 level rồi giữ <b>" + top.length +
        "</b> điểm có R cao nhất (không phân biệt level). Phân bố: " +
        levels.map((L, i) => "<span class='lsw' style='background:" + LC[i] + "'></span>level " + i + ": <b>" + perLevel[i] + "</b>").join(" ") +
        " — mỗi level bắt loại đặc trưng riêng của nó (level 0: chi tiết nhỏ, level thô: cấu trúc lớn); scale của keypoint = 1.2<sup>level</sup> cho biết nó được nhìn ở mức phóng đại nào.";
    }
    mount.querySelector("#hp-n").oninput = hpRender;

    function buildBase() {
      baseFast = document.createElement("canvas");
      baseFast.width = 430; baseFast.height = 243;
      const bctx = baseFast.getContext("2d");
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, img.gray, img.w, img.h);
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(tmp, 0, 0, 430, 243);
      const scale = 430 / img.w;
      for (const q of pts) {
        bctx.fillStyle = "rgba(46,134,222,.75)";
        bctx.fillRect(q.x * scale - 1, q.y * scale - 1, 2.4, 2.4);
      }
    }

    function render() {
      if (!img) return;
      const N = +mount.querySelector("#ha-n").value;
      mount.querySelector("#ha-nv").textContent = N;
      const scale = 430 / img.w;
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, img.gray, img.w, img.h);
      cTop.imageSmoothingEnabled = true;
      cTop.clearRect(0, 0, 430, 243);
      cTop.drawImage(tmp, 0, 0, 430, 243);
      const rmax = pts.length ? pts[0].r : 1;
      pts.forEach((q, rank) => { // đã sort — rank = thứ hạng Harris
        const kept = rank < N;
        const tcol = rmax > 0 ? Math.max(0, Math.min(1, q.r / rmax)) : 0;
        cTop.globalAlpha = kept ? 1 : 0.22;
        cTop.fillStyle = scoreColor(tcol);
        cTop.fillRect(q.x * scale - 1.4, q.y * scale - 1.4, 3.2, 3.2);
        if (kept) { cTop.globalAlpha = 1; IMG.drawCircle(cTop, q.x * scale, q.y * scale, 3.4, "rgba(255,255,255,.9)", 1.1); }
        cTop.globalAlpha = 1;
      });
      mount.querySelector("#ha-stats").innerHTML =
        "<b>FAST: " + pts.length + "</b> điểm → Harris xếp hạng → <b>giữ " + Math.min(N, pts.length) + "</b> (demo octave 0; thật: mỗi level pyramid rồi gộp)";
    }
    mount.querySelector("#ha-n").oninput = render;

    // ---------- tensor viewer ----------
    const zCtx = mount.querySelector("#ht-zoom").getContext("2d");
    const ixT = mount.querySelector("#ht-ix"), iyT = mount.querySelector("#ht-iy"), xiyT = mount.querySelector("#ht-ixiy");
    const ell = mount.querySelector("#ht-ell").getContext("2d");
    let pinned = null;

    function inspect(x, y, label) {
      if (!img) return;
      x = Math.max(4, Math.min(img.w - 5, Math.round(x)));
      y = Math.max(4, Math.min(img.h - 5, Math.round(y)));
      const P = IMG.harrisParts(img.gray, img.w, img.h, x, y, 7, 0.04);

      // vẽ lại ảnh trái + điểm đang soi
      cFast.clearRect(0, 0, 430, 243);
      cFast.drawImage(baseFast, 0, 0);
      const sc = 430 / img.w;
      IMG.drawCircle(cFast, x * sc, y * sc, 7, "#E02424", 2);
      IMG.drawCircle(cFast, x * sc, y * sc, 2, "#E02424", 2);

      // cửa sổ 7×7 phóng to
      const cw = 22, off = 4;
      zCtx.imageSmoothingEnabled = false;
      zCtx.fillStyle = "#0F2B46"; zCtx.fillRect(0, 0, 154, 154);
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, img.gray, img.w, img.h);
      zCtx.drawImage(tmp, x - 3, y - 3, 7, 7, off, off, 7 * cw, 7 * cw);
      for (let i = 0; i <= 7; i++) {
        zCtx.strokeStyle = "rgba(15,43,70,.25)"; zCtx.lineWidth = 1;
        zCtx.beginPath(); zCtx.moveTo(off + i * cw, off); zCtx.lineTo(off + i * cw, off + 7 * cw); zCtx.stroke();
        zCtx.beginPath(); zCtx.moveTo(off, off + i * cw); zCtx.lineTo(off + 7 * cw, off + i * cw); zCtx.stroke();
      }
      // số I thật trên từng cell + tô viền 3 cặp cell liên quan Ix / Iy
      zCtx.font = "10px 'DejaVu Sans Mono', Consolas, monospace"; zCtx.textAlign = "center";
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        const v = img.gray[Math.max(0, Math.min(img.h - 1, y + j - 3)) * img.w + Math.max(0, Math.min(img.w - 1, x + i - 3))];
        zCtx.fillStyle = v < 110 ? "rgba(255,255,255,.92)" : "rgba(15,43,70,.9)";
        zCtx.fillText(Math.round(v), off + i * cw + cw / 2, off + j * cw + cw / 2 + 3);
      }
      zCtx.lineWidth = 2;
      const mark = (i, j, col) => { zCtx.strokeStyle = col; zCtx.strokeRect(off + i * cw + 1, off + j * cw + 1, cw - 2, cw - 2); };
      mark(4, 3, "#2E86DE"); mark(2, 3, "#2E86DE");   // cặp pixel của Ix
      mark(3, 4, "#0E9F6E"); mark(3, 2, "#0E9F6E");   // cặp pixel của Iy
      mark(3, 3, "#E02424");                           // tâm
      // phương trình Ix, Iy, Ix·Iy với số thật (gradient trung tâm = gradAt) — 1 chữ số lẻ vì luma là số thực
      const g0 = IMG.gradAt(img.gray, img.w, img.h, x, y);
      const vr = (dx, dy) => img.gray[Math.max(0, Math.min(img.h - 1, y + dy)) * img.w + Math.max(0, Math.min(img.w - 1, x + dx))].toFixed(1);
      mount.querySelector("#ht-eq").innerHTML =
        "<b>Ix</b> = I(x+1, y) − I(x−1, y) = <b>" + vr(1, 0) + "</b> − <b>" + vr(-1, 0) + "</b> = <b>" + g0.gx.toFixed(1) + "</b>" +
        " &nbsp;·&nbsp; <b>Iy</b> = I(x, y+1) − I(x, y−1) = <b>" + vr(0, 1) + "</b> − <b>" + vr(0, -1) + "</b> = <b>" + g0.gy.toFixed(1) + "</b><br>" +
        "<b>Ix·Iy</b> = " + g0.gx.toFixed(1) + " × " + g0.gy.toFixed(1) + " = <b>" + (g0.gx * g0.gy).toFixed(1) + "</b>" +
        "<br><small>số trên ảnh là giá trị làm tròn — Ix, Iy tính từ luma gốc (số thực) · viền xanh dương = cặp pixel của Ix · xanh lá = cặp của Iy · lặp lại cho cả 49 cell rồi cộng: ΣIx², ΣIxIy, ΣIy² ⇒ M bên phải</small>";

      // heatmaps 7×7 của Ix, Iy, Ix·Iy
      const draw7 = (cv, getv) => {
        const c = cv.getContext("2d"), s = 16;
        c.clearRect(0, 0, 112, 112);
        let m = 1e-6;
        for (const row of P.cells) for (const g of row) m = Math.max(m, Math.abs(getv(g)));
        for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
          c.fillStyle = heatColor(getv(P.cells[j][i]), m);
          c.fillRect(i * s, j * s, s - 1, s - 1);
        }
      };
      draw7(ixT, g => g.gx);
      draw7(iyT, g => g.gy);
      draw7(xiyT, g => g.gx * g.gy);

      // ma trận M + số
      mount.querySelector("#ht-M").innerHTML =
        "<tr><td>" + P.M[0][0].toFixed(0) + "</td><td>" + P.M[0][1].toFixed(0) + "</td></tr>" +
        "<tr><td>" + P.M[1][0].toFixed(0) + "</td><td>" + P.M[1][1].toFixed(0) + "</td></tr>";
      mount.querySelector("#ht-nums").innerHTML =
        "det = <b>" + fmtI(P.det) + "</b> · trace = <b>" + fmtI(P.trace) + "</b><br>" +
        "λ₁ = <b>" + fmtI(P.lam1) + "</b> · λ₂ = <b>" + fmtI(P.lam2) + "</b><br>" +
        "R = det − 0.04·trace² = <b>" + fmtI(P.R) + "</b>";
      function fmtI(v) { return Math.round(v).toLocaleString("vi-VN"); }

      // ellipse λ
      const c = 154 / 2, s1 = Math.min(58, 4.2 * Math.sqrt(Math.max(0, P.lam1))), s2 = Math.min(58, 4.2 * Math.sqrt(Math.max(0, P.lam2)));
      ell.clearRect(0, 0, 154, 154);
      ell.fillStyle = "#F4F7FA"; ell.fillRect(0, 0, 154, 154);
      IMG.drawCircle(ell, c, c, 60, "#D8E3F0", 1);
      ell.save(); ell.translate(c, c); ell.rotate(-P.axisTheta);
      ell.beginPath(); ell.ellipse(0, 0, Math.max(2, s1), Math.max(1, s2), 0, 0, Math.PI * 2);
      ell.strokeStyle = "#E67E22"; ell.lineWidth = 3; ell.stroke();
      ell.restore();
      ell.fillStyle = "#0F2B46"; ell.font = "11px Arial"; ell.textAlign = "center";
      ell.fillText("λ₁ : λ₂ ≈ " + (P.lam2 > 1e-6 ? (P.lam1 / P.lam2).toFixed(1) : "∞"), c, 148);

      // phân loại
      const cls = mount.querySelector("#ht-cls");
      const gscale = Math.abs(P.lam1) + Math.abs(P.lam2);
      let tag, why;
      if (gscale < 60) { tag = "VÙNG PHẲNG"; why = "λ₁, λ₂ đều ≈ 0 — không cong hướng nào, R ≈ 0"; }
      else if (P.lam2 < 0.12 * P.lam1) { tag = "TRÊN CẠNH"; why = "λ₁ ≫ λ₂ — chỉ cong theo 1 hướng ⇒ cực trị giả, R âm"; }
      else { tag = "GÓC"; why = "cả 2 λ lớn — cong đều mọi hướng ⇒ R lớn, đáng giữ"; }
      cls.innerHTML = "<span class='ht-badge " + (tag === "GÓC" ? "bg" : tag === "TRÊN CẠNH" ? "be" : "bf") + "'>" + tag + "</span><small>" + why + "</small>";
      mount.querySelector("#ha-pos").innerHTML = "đang soi (x, y) = (" + x + ", " + y + ")" + (label ? " — " + label : "") +
        (pinned ? " · <b>đã ghim</b> (bấm lại để bỏ ghim)" : " · rê chuột để đổi điểm");
    }

    // hover / click
    const posOf = (e) => {
      const r = cFast.canvas.getBoundingClientRect();
      const sx = 430 / r.width;
      return { x: (e.clientX - r.left) * sx * img.w / 430, y: (e.clientY - r.top) * (243 / r.height) * img.h / 243 };
    };
    cFast.canvas.addEventListener("mousemove", (e) => { if (!pinned && img) { const p = posOf(e); inspect(p.x, p.y); } });
    cFast.canvas.addEventListener("mouseleave", () => { if (!pinned && img && presets) inspect(presets.corner.x, presets.corner.y, "góc"); });
    cFast.canvas.addEventListener("click", (e) => {
      if (!img) return;
      const p = posOf(e);
      if (pinned && Math.hypot(pinned.x - p.x, pinned.y - p.y) < 4) { pinned = null; inspect(p.x, p.y); return; }
      pinned = { x: p.x, y: p.y };
      inspect(p.x, p.y);
    });
    mount.querySelectorAll(".ha-pin").forEach(b => b.onclick = () => {
      if (!presets) return;
      pinned = null;
      const m = { corner: "góc", edge: "trên cạnh", flat: "vùng phẳng" }[b.dataset.pin];
      inspect(presets[b.dataset.pin].x, presets[b.dataset.pin].y, m);
    });
  }
})();
