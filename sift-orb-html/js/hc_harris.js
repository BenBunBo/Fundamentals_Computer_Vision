/* Widgets trang HARRIS corner detector — 4 widget, mọi số đều tính thật từ ảnh mẫu:
   1. w-hc-shift  — E(u,v): dịch cửa sổ thật, so E thật với xấp xỉ Taylor [u v]M[u v]ᵀ
   2. w-hc-tensor — tensor viewer: gradient từng pixel → M → λ₁ λ₂ → R → ellipse + xếp loại
   3. w-hc-lam    — mặt phẳng eigenvalue: rải (λ₁, λ₂) của ~24,000 pixel thật, biên R = 0 theo κ
   4. w-hc-full   — pipeline đầy đủ: R-map, ngưỡng tương đối, NMS — κ / blockSize / ngưỡng kéo được
   Các widget liên kết nhau qua HCPICK (hc_common.js): bấm điểm ở widget 3 → widget 1 & 2 nhảy theo. */
"use strict";
(() => {
  const fmtI = v => Math.round(v).toLocaleString("vi-VN");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- ramp màu ----------
  function ramp(stops, t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        return "rgb(" + Math.round(c0[0] + (c1[0] - c0[0]) * u) + "," + Math.round(c0[1] + (c1[1] - c0[1]) * u) + "," + Math.round(c0[2] + (c1[2] - c0[2]) * u) + ")";
      }
    }
    const c = stops[stops.length - 1][1];
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }
  const heatE = t => ramp([[0, [255, 250, 238]], [0.35, [255, 214, 130]], [0.7, [235, 140, 60]], [1, [178, 24, 43]]], t); // E: trắng kem → đỏ
  const posRamp = t => ramp([[0, [255, 255, 255]], [0.3, [255, 213, 105]], [0.65, [235, 120, 50]], [1, [170, 20, 40]]], t);
  const negRamp = t => ramp([[0, [255, 255, 255]], [1, [21, 101, 192]]], t);
  const heatGrad = (v, m) => { // gradient heatmap: đỏ(+)/xanh(−) quanh trắng
    const t = clamp(v / (m || 1), -1, 1);
    if (t >= 0) return "rgb(255," + Math.round(255 - 150 * t) + "," + Math.round(255 - 150 * t) + ")";
    const u = -t;
    return "rgb(" + Math.round(255 - 140 * u) + "," + Math.round(255 - 140 * u) + ",255)";
  };

  // ---------- Harris tại 1 điểm: tổng cửa sổ + eigen (giống IMG.harrisParts nhưng có góc eigenvector đúng) ----------
  function harrisSums(gray, w, h, x, y, block, kappa) {
    const r = block >> 1;
    let Sxx = 0, Syy = 0, Sxy = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = clamp(x + dx, 1, w - 2), py = clamp(y + dy, 1, h - 2);
        const gx = gray[py * w + px + 1] - gray[py * w + px - 1];
        const gy = gray[(py + 1) * w + px] - gray[(py - 1) * w + px];
        Sxx += gx * gx; Syy += gy * gy; Sxy += gx * gy;
      }
    }
    const det = Sxx * Syy - Sxy * Sxy, trace = Sxx + Syy;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    const lam1 = trace / 2 + disc, lam2 = trace / 2 - disc;
    // eigenvector của λ1: v ∝ (λ1 − Syy, Sxy) — góc tính trong hệ ảnh (x phải, y xuống)
    let theta;
    if (Math.abs(Sxy) < 1e-9) theta = Sxx >= Syy ? 0 : Math.PI / 2;
    else theta = Math.atan2(Sxy, lam1 - Syy);
    return { M: [[Sxx, Sxy], [Sxy, Syy]], Sxx, Syy, Sxy, det, trace, lam1, lam2, R: det - kappa * trace * trace, theta };
  }

  // ---------- gradient maps (sai phân trung tâm, biên clamp — như Python generate_hc_assets.py) ----------
  function gradientMaps(gray, w, h) {
    const gx = new Float64Array(w * h), gy = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xp = x < w - 1 ? x + 1 : x, xm = x > 0 ? x - 1 : x;
        const yp = y < h - 1 ? y + 1 : y, ym = y > 0 ? y - 1 : y;
        gx[row + x] = gray[row + xp] - gray[row + xm];
        gy[row + x] = gray[yp * w + x] - gray[ym * w + x];
      }
    }
    return { gx, gy };
  }

  // ---------- integral image + tổng cửa sổ (biên clamp) ----------
  function integral(src, w, h) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0;
      for (let x = 0; x < w; x++) {
        rs += src[y * w + x];
        I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + rs;
      }
    }
    return I;
  }
  function isum(I, w1, x0, y0, x1, y1) {
    return I[(y1 + 1) * w1 + x1 + 1] - I[y0 * w1 + x1 + 1] - I[(y1 + 1) * w1 + x0] + I[y0 * w1 + x0];
  }

  // ---------- ảnh mẫu + 3 điểm mẫu (dùng chung 4 widget) ----------
  let sharedP = null;
  function shared() {
    if (!sharedP) sharedP = IMG.sample().then(img => {
      let edge = null, flat = null, edgeR = Infinity, flatG = Infinity;
      for (let y = 10; y < img.h - 10; y += 3) {
        for (let x = 10; x < img.w - 10; x += 3) {
          const P = harrisSums(img.gray, img.w, img.h, x, y, 7, 0.04);
          if (P.R < edgeR) { edgeR = P.R; edge = { x, y }; }
          const gx = img.gray[y * img.w + x + 1] - img.gray[y * img.w + x - 1];
          const gy = img.gray[(y + 1) * img.w + x] - img.gray[(y - 1) * img.w + x];
          const m = Math.abs(gx) + Math.abs(gy);
          if (m < flatG) { flatG = m; flat = { x, y }; }
        }
      }
      let corner = null;
      if (typeof REAL_HC !== "undefined" && REAL_HC.harris) corner = { x: REAL_HC.harris.x, y: REAL_HC.harris.y };
      if (!corner) { // fallback: quét tìm R max
        let best = -Infinity;
        for (let y = 10; y < img.h - 10; y += 2)
          for (let x = 10; x < img.w - 10; x += 2) {
            const P = harrisSums(img.gray, img.w, img.h, x, y, 7, 0.04);
            if (P.R > best) { best = P.R; corner = { x, y }; }
          }
      }
      return { img, presets: { corner, edge, flat } };
    });
    return sharedP;
  }

  const LABELS = { corner: "góc", edge: "trên cạnh", flat: "vùng phẳng" };
  function drawBase(img, canvas) { // ảnh xám scale về cỡ canvas
    const tmp = document.createElement("canvas");
    IMG.putGray(tmp, img.gray, img.w, img.h);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    return canvas.width / img.w;
  }
  function posOf(e, canvas, img) {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) * canvas.width / r.width / canvas.width * img.w, 0, img.w - 1),
      y: clamp((e.clientY - r.top) * canvas.height / r.height / canvas.height * img.h, 0, img.h - 1),
    };
  }

  /* ================================================================
     WIDGET 1 — E(u, v): dịch cửa sổ thật + so xấp xỉ Taylor
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-shift");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <button class="w-btn hs-pin" data-pin="corner">Mẫu: góc</button>
          <button class="w-btn hs-pin" data-pin="edge">Mẫu: trên cạnh</button>
          <button class="w-btn hs-pin" data-pin="flat">Mẫu: vùng phẳng</button>
          <span class="w-info" id="hs-pos"></span>
        </div>
        <div class="w-canvas-wrap">
          <div>
            <canvas id="hs-img" width="430" height="243" style="cursor:crosshair"></canvas>
            <div class="ha-legend"><b>Bấm lên ảnh</b> để chọn điểm xét — cửa sổ 11×11 quanh điểm (rê chuột không ghim). Điểm chọn được truyền sang tensor viewer bên dưới.</div>
          </div>
          <div>
            <canvas id="hs-heat" width="262" height="262" style="cursor:crosshair"></canvas>
            <div class="ha-legend"><span class="sw" style="background:#FFFAEE"></span> E nhỏ → <span class="sw" style="background:#EB8C3C"></span> vừa → <span class="sw" style="background:#B2182B"></span> lớn<br>mũi tên <b>liền = λ₁</b> (dốc nhất) · <b>đứt = λ₂</b> (bằng nhất) · rê chuột lên ô để soi số</div>
          </div>
          <div style="width:255px;flex:none">
            <div class="card" style="padding:10px 12px">
              <b style="font-size:13px">Tại ô (u, v) đang rê</b>
              <div class="ht-nums" id="hs-nums"></div>
            </div>
            <div class="card" style="padding:10px 12px;margin-top:10px">
              <b style="font-size:13px">Đọc bề mặt E</b>
              <p style="font-size:12px;margin:0">Góc → đỏ <b>đều mọi hướng</b> (chén) · cạnh → một dải đỏ, còn lại gần trắng (rãnh) · phẳng → trắng gần hết (đĩa). E thật so Ê = [u v]M[u v]ᵀ: gần trùng ở |u| nhỏ, lệch dần khi dịch xa — đúng phạm vi hiệu lực của Taylor bậc 1.</p>
            </div>
          </div>
        </div>`;

      const cImg = mount.querySelector("#hs-img").getContext("2d");
      const cHeat = mount.querySelector("#hs-heat").getContext("2d");
      let img = null, presets = null;
      let cur = null, P = null, E = null, Emax = 1, hover = { u: 2, v: 1 }, pinned = null;

      const KV = 4, RWIN = 5, CELL = 24, MARG = 19; // u,v ∈ [−4,4]; cửa sổ 11×11
      shared().then(s => { img = s.img; presets = s.presets; setPoint(presets.corner.x, presets.corner.y, "góc"); });

      function pix(x, y) {
        return img.gray[clamp(y, 0, img.h - 1) * img.w + clamp(x, 0, img.w - 1)];
      }
      function setPoint(x, y, label) {
        x = Math.round(clamp(x, 6, img.w - 7)); y = Math.round(clamp(y, 6, img.h - 7));
        cur = { x, y, label: label || "" };
        P = harrisSums(img.gray, img.w, img.h, x, y, 11, 0.04);
        E = new Float64Array(9 * 9); Emax = 1e-9;
        for (let vi = 0; vi <= 8; vi++) for (let ui = 0; ui <= 8; ui++) {
          const u = ui - 4, v = vi - 4;
          let s = 0;
          for (let dy = -RWIN; dy <= RWIN; dy++)
            for (let dx = -RWIN; dx <= RWIN; dx++) {
              const d = pix(x + dx + u, y + dy + v) - pix(x + dx, y + dy);
              s += d * d;
            }
          E[vi * 9 + ui] = s;
          if (s > Emax) Emax = s;
        }
        render();
      }
      function heatXY(ui, vi) { return [MARG + ui * CELL, MARG + vi * CELL]; }

      function render() {
        const sc = drawBase(img, cImg.canvas);
        IMG.drawCircle(cImg, cur.x * sc, cur.y * sc, 9, "#E02424", 2);
        IMG.drawCircle(cImg, cur.x * sc, cur.y * sc, 2, "#E02424", 2);

        cHeat.fillStyle = "#fff"; cHeat.fillRect(0, 0, 262, 262);
        for (let vi = 0; vi < 9; vi++) for (let ui = 0; ui < 9; ui++) {
          const [px, py] = heatXY(ui, vi);
          cHeat.fillStyle = heatE(E[vi * 9 + ui] / Emax);
          cHeat.fillRect(px, py, CELL - 1, CELL - 1);
        }
        // khung + trục
        cHeat.strokeStyle = "#94A3B8"; cHeat.lineWidth = 1;
        cHeat.strokeRect(MARG, MARG, 9 * CELL - 1, 9 * CELL - 1);
        cHeat.fillStyle = "#64748B"; cHeat.font = "10px Arial"; cHeat.textAlign = "center";
        for (let i = -4; i <= 4; i += 2) {
          const [px] = heatXY(i + 4, 0);
          cHeat.fillText(String(i), px + CELL / 2, MARG + 9 * CELL + 13);
          const [, py] = heatXY(0, i + 4);
          cHeat.fillText(String(i), MARG - 10, py + CELL / 2 + 3);
        }
        cHeat.fillText("u →", MARG + 4.5 * CELL, MARG + 9 * CELL + 26);
        cHeat.save(); cHeat.translate(9, MARG + 4.5 * CELL); cHeat.rotate(-Math.PI / 2);
        cHeat.fillText("v →", 0, 0); cHeat.restore();
        // ô (0,0) + ô hover
        const [cx, cy] = heatXY(4, 4);
        cHeat.strokeStyle = "#fff"; cHeat.lineWidth = 2;
        cHeat.strokeRect(cx, cy, CELL - 1, CELL - 1);
        if (hover) {
          const [hx, hy] = heatXY(hover.u + 4, hover.v + 4);
          cHeat.strokeStyle = "#0F2B46"; cHeat.lineWidth = 2.2;
          cHeat.strokeRect(hx, hy, CELL - 1, CELL - 1);
        }
        // mũi tên λ1 (đặc) & λ2 (đứt) từ tâm
        const c0x = MARG + 4 * CELL + CELL / 2, c0y = MARG + 4 * CELL + CELL / 2;
        const arrow = (ang, len, color, dash, tag) => {
          cHeat.save(); cHeat.translate(c0x, c0y); cHeat.rotate(ang);
          cHeat.strokeStyle = color; cHeat.lineWidth = 2.4; cHeat.setLineDash(dash || []);
          cHeat.beginPath(); cHeat.moveTo(-len, 0); cHeat.lineTo(len, 0); cHeat.stroke();
          cHeat.setLineDash([]);
          cHeat.beginPath(); cHeat.moveTo(len, 0); cHeat.lineTo(len - 6, -4); cHeat.lineTo(len - 6, 4); cHeat.closePath();
          cHeat.fillStyle = color; cHeat.fill();
          cHeat.rotate(-ang);
          cHeat.font = "bold 10px Arial"; cHeat.fillStyle = "#0F2B46";
          cHeat.fillText(tag, 0, -len - 4);
          cHeat.restore();
        };
        arrow(P.theta, 62, "rgba(15,43,70,.92)", [], "λ₁");
        arrow(P.theta + Math.PI / 2, 62, "rgba(255,255,255,.95)", [4, 3], "λ₂");

        nums();
        mount.querySelector("#hs-pos").innerHTML = "đang xét (x, y) = (" + cur.x + ", " + cur.y + ")" + (cur.label ? " — " + cur.label : "") + (pinned ? " · <b>đã ghim</b>" : "");
      }

      function nums() {
        const u = hover.u, v = hover.v;
        const Er = E[(v + 4) * 9 + (u + 4)];
        // M dùng gradient sai phân I(x+1)−I(x−1) = 2·∂I (chuẩn Harris/OpenCV) ⇒
        // [u v]M[u v]ᵀ gấp 4 lần năng lượng theo pixel — chia 4 để so cùng thang với E thật
        const Et = (P.M[0][0] * u * u + 2 * P.M[0][1] * u * v + P.M[1][1] * v * v) / 4;
        const err = Er > 1e-9 ? Math.abs(Er - Et) / Er * 100 : 0;
        mount.querySelector("#hs-nums").innerHTML =
          "E thật (dịch ảnh) = <b>" + fmtI(Er) + "</b><br>" +
          "Ê = [u v]M[u v]ᵀ/4 = <b>" + fmtI(Et) + "</b><br>" +
          "lệch ≈ <b>" + err.toFixed(0) + "%</b><br>" +
          "<span style='color:#64748B;font-size:11.5px'>M 11×11: det = " + fmtI(P.det) + " · trace = " + fmtI(P.trace) + " · λ₁ = " + fmtI(P.lam1) + " · λ₂ = " + fmtI(P.lam2) + "<br>chia 4 vì gradient sai phân = 2·∂I (mượt thì E thang nào cũng vậy — R chỉ so tương đối nên không ảnh hưởng)</span>";
      }

      cHeat.canvas.addEventListener("mousemove", e => {
        const r = cHeat.canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) * 262 / r.width - MARG, py = (e.clientY - r.top) * 262 / r.height - MARG;
        const ui = Math.floor(px / CELL), vi = Math.floor(py / CELL);
        if (ui < 0 || ui > 8 || vi < 0 || vi > 8) return;
        hover = { u: ui - 4, v: vi - 4 };
        render();
      });
      cHeat.canvas.addEventListener("mouseleave", () => { hover = { u: 2, v: 1 }; render(); });

      const onImg = e => posOf(e, cImg.canvas, img);
      cImg.canvas.addEventListener("click", e => {
        if (!img) return;
        const p = onImg(e);
        pinned = { x: p.x, y: p.y };
        setPoint(p.x, p.y, "");
        HCPICK.emit(p.x, p.y, "từ widget E(u,v)");
      });
      mount.querySelectorAll(".hs-pin").forEach(b => b.onclick = () => {
        if (!presets) return;
        pinned = null;
        const pr = presets[b.dataset.pin];
        setPoint(pr.x, pr.y, LABELS[b.dataset.pin]);
        HCPICK.emit(pr.x, pr.y, LABELS[b.dataset.pin]);
      });
      HCPICK.on((x, y, label) => { if (img) { pinned = null; setPoint(x, y, label); } });
    }
  })();

  /* ================================================================
     WIDGET 2 — tensor viewer: gradient → M → λ → R tại 1 điểm
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-tensor");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <button class="w-btn ht-pin" data-pin="corner">Mẫu: góc</button>
          <button class="w-btn ht-pin" data-pin="edge">Mẫu: trên cạnh</button>
          <button class="w-btn ht-pin" data-pin="flat">Mẫu: vùng phẳng</button>
          <span class="w-info" id="ht-pos"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="ht-img" width="400" height="225" style="cursor:crosshair"></canvas>
            <div class="ha-legend"><b>Rê chuột / bấm</b> lên ảnh để soi điểm bất kỳ — cửa sổ 7×7, gradient sai phân trung tâm, κ = 0.04 (giống OpenCV cornerHarris trừ kernel đạo hàm).</div></div>
          <div class="ha-tcell" style="flex:0 0 auto">
            <small>Cửa sổ 7×7 (phóng to)</small>
            <canvas id="ht-zoom" width="154" height="154"></canvas>
          </div>
          <div class="ha-tcell" style="flex:0 0 auto">
            <small>I<sub>x</sub> — đạo hàm theo x</small>
            <canvas id="ht-ix" width="112" height="112"></canvas>
          </div>
          <div class="ha-tcell" style="flex:0 0 auto">
            <small>I<sub>y</sub> — đạo hàm theo y</small>
            <canvas id="ht-iy" width="112" height="112"></canvas>
          </div>
          <div class="ha-tcell" style="flex:0 0 auto">
            <small>I<sub>x</sub>·I<sub>y</sub> — tích chéo</small>
            <canvas id="ht-ixiy" width="112" height="112"></canvas>
          </div>
        </div>
        <div class="w-canvas-wrap" style="margin-top:12px">
          <div style="min-width:250px">
            <small style="color:#64748B;display:block;margin-bottom:6px">M = Σ<sub>w</sub>[I<sub>x</sub>², I<sub>x</sub>I<sub>y</sub>; I<sub>x</sub>I<sub>y</sub>, I<sub>y</sub>²] — tổng 49 ô (w = 1)</small>
            <table class="mat" id="ht-M"></table>
            <div class="ht-nums" id="ht-nums"></div>
          </div>
          <div style="text-align:center">
            <small style="color:#64748B;display:block;margin-bottom:6px">Ellipse: bán trục ∝ √λᵢ (độ dốc E theo 2 trục chính)</small>
            <canvas id="ht-ell" width="170" height="160"></canvas>
            <div class="ht-cls" id="ht-cls"></div>
          </div>
          <div style="flex:1;min-width:230px">
            <small style="color:#64748B;display:block;margin-bottom:6px">Ba trường hợp — điểm này thuộc trường hợp nào?</small>
            <div class="card" style="padding:9px 12px;font-size:12px;line-height:1.55">
              <b style="color:#94A3B8">PHẲNG:</b> λ₁ ≈ λ₂ ≈ 0<br>
              <b style="color:#E02424">CẠNH:</b> λ₁ ≫ λ₂ (một hướng cong)<br>
              <b style="color:#0E9F6E">GÓC:</b> cả hai lớn — R = det − κ·trace² &gt; 0
            </div>
          </div>
        </div>`;

      const cImg = mount.querySelector("#ht-img").getContext("2d");
      let img = null, presets = null, pinned = null;
      shared().then(s => {
        img = s.img; presets = s.presets;
        inspect(presets.corner.x, presets.corner.y, "góc");
      });

      function inspect(x, y, label) {
        x = Math.round(clamp(x, 4, img.w - 5)); y = Math.round(clamp(y, 4, img.h - 5));
        const P = IMG.harrisParts(img.gray, img.w, img.h, x, y, 7, 0.04);
        const theta1 = Math.abs(P.M[0][1]) < 1e-9 ? (P.M[0][0] >= P.M[1][1] ? 0 : Math.PI / 2) : Math.atan2(P.M[0][1], P.lam1 - P.M[1][1]);

        const sc = drawBase(img, cImg.canvas);
        IMG.drawCircle(cImg, x * sc, y * sc, 8, "#E02424", 2);
        IMG.drawCircle(cImg, x * sc, y * sc, 2, "#E02424", 2);

        const zCtx = mount.querySelector("#ht-zoom").getContext("2d");
        const cw = 20, off = 7;
        zCtx.imageSmoothingEnabled = false;
        zCtx.fillStyle = "#0F2B46"; zCtx.fillRect(0, 0, 154, 154);
        const tmp = document.createElement("canvas");
        IMG.putGray(tmp, img.gray, img.w, img.h);
        zCtx.drawImage(tmp, x - 3, y - 3, 7, 7, off, off, 7 * cw, 7 * cw);
        zCtx.strokeStyle = "rgba(15,43,70,.22)";
        for (let i = 0; i <= 7; i++) {
          zCtx.beginPath(); zCtx.moveTo(off + i * cw, off); zCtx.lineTo(off + i * cw, off + 7 * cw); zCtx.stroke();
          zCtx.beginPath(); zCtx.moveTo(off, off + i * cw); zCtx.lineTo(off + 7 * cw, off + i * cw); zCtx.stroke();
        }
        zCtx.strokeStyle = "#E02424"; zCtx.lineWidth = 2;
        zCtx.strokeRect(off + 3 * cw, off + 3 * cw, cw, cw);

        const draw7 = (cv, getv) => {
          const c = cv.getContext("2d"), s = 16;
          c.clearRect(0, 0, 112, 112);
          let m = 1e-6;
          for (const row of P.cells) for (const g of row) m = Math.max(m, Math.abs(getv(g)));
          for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
            c.fillStyle = heatGrad(getv(P.cells[j][i]), m);
            c.fillRect(i * s, j * s, s - 1, s - 1);
          }
        };
        draw7(mount.querySelector("#ht-ix"), g => g.gx);
        draw7(mount.querySelector("#ht-iy"), g => g.gy);
        draw7(mount.querySelector("#ht-ixiy"), g => g.gx * g.gy);

        mount.querySelector("#ht-M").innerHTML =
          "<tr><td>" + fmtI(P.M[0][0]) + "</td><td>" + fmtI(P.M[0][1]) + "</td></tr>" +
          "<tr><td>" + fmtI(P.M[1][0]) + "</td><td>" + fmtI(P.M[1][1]) + "</td></tr>";
        const tratio = P.lam2 > 1e-6 ? (P.lam2 / P.lam1) : 0;
        mount.querySelector("#ht-nums").innerHTML =
          "det = <b>" + fmtI(P.det) + "</b> · trace = <b>" + fmtI(P.trace) + "</b><br>" +
          "λ₁ = <b>" + fmtI(P.lam1) + "</b> · λ₂ = <b>" + fmtI(P.lam2) + "</b><br>" +
          "λ₂/λ₁ = <b>" + tratio.toFixed(3) + "</b> · R = <b>" + fmtI(P.R) + "</b>";

        const ell = mount.querySelector("#ht-ell").getContext("2d");
        const c = 85, cy = 80;
        ell.fillStyle = "#F4F7FA"; ell.fillRect(0, 0, 170, 160);
        IMG.drawCircle(ell, c, cy, 62, "#D8E3F0", 1);
        const s1 = clamp(5.2 * Math.sqrt(Math.max(0, P.lam1)), 2, 56), s2 = clamp(5.2 * Math.sqrt(Math.max(0, P.lam2)), 1.4, 56);
        ell.save(); ell.translate(c, cy); ell.rotate(theta1);
        ell.beginPath(); ell.ellipse(0, 0, s1, s2, 0, 0, Math.PI * 2);
        ell.strokeStyle = "#E67E22"; ell.lineWidth = 3; ell.stroke();
        ell.restore();
        ell.fillStyle = "#0F2B46"; ell.font = "11px Arial"; ell.textAlign = "center";
        ell.fillText("λ₁ : λ₂ ≈ " + (P.lam2 > 1e-6 ? (P.lam1 / P.lam2).toFixed(1) : "∞"), c, 152);

        const cls = mount.querySelector("#ht-cls");
        let tag, why, bg;
        if (P.lam1 < 40) { tag = "VÙNG PHẲNG"; why = "λ₁, λ₂ ≈ 0 — E gần như bằng phẳng mọi hướng"; bg = "bf"; }
        else if (P.lam2 < 0.15 * P.lam1) { tag = "TRÊN CẠNH"; why = "λ₂ ≪ λ₁ — chỉ cong 1 hướng ⇒ R âm"; bg = "be"; }
        else { tag = "GÓC"; why = "cả hai λ lớn ⇒ R dương lớn — đáng giữ"; bg = "bg"; }
        cls.innerHTML = "<span class='ht-badge " + bg + "'>" + tag + "</span><small>" + why + "</small>";
        mount.querySelector("#ht-pos").innerHTML = "đang soi (x, y) = (" + x + ", " + y + ")" + (label ? " — " + label : "") + (pinned ? " · <b>đã ghim</b>" : "");
      }

      const onImg = e => posOf(e, cImg.canvas, img);
      cImg.canvas.addEventListener("mousemove", e => { if (!pinned && img) { const p = onImg(e); inspect(p.x, p.y); } });
      cImg.canvas.addEventListener("mouseleave", () => { if (!pinned && img && presets) inspect(presets.corner.x, presets.corner.y, "góc"); });
      cImg.canvas.addEventListener("click", e => {
        if (!img) return;
        const p = onImg(e);
        if (pinned && Math.hypot(pinned.x - p.x, pinned.y - p.y) < 4) { pinned = null; inspect(p.x, p.y); return; }
        pinned = { x: p.x, y: p.y };
        inspect(p.x, p.y);
        HCPICK.emit(p.x, p.y, "từ tensor viewer");
      });
      mount.querySelectorAll(".ht-pin").forEach(b => b.onclick = () => {
        if (!presets) return;
        pinned = null;
        const pr = presets[b.dataset.pin];
        inspect(pr.x, pr.y, LABELS[b.dataset.pin]);
        HCPICK.emit(pr.x, pr.y, LABELS[b.dataset.pin]);
      });
      HCPICK.on((x, y, label) => { if (img) { pinned = null; inspect(x, y, label); } });
    }
  })();

  /* ================================================================
     WIDGET 3 — mặt phẳng eigenvalue: (λ₁, λ₂) của ~24,000 pixel thật
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-lam");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>κ = <input type="range" id="lm-k" min="0.01" max="0.24" step="0.01" value="0.04"><b id="lm-kv" style="font-size:13px;color:#0F2B46">0.04</b></label>
          <label>Ngưỡng Shi–Tomasi (min λ): <input type="range" id="lm-st" min="0" max="100" step="1" value="25"><b id="lm-stv" style="font-size:13px;color:#0F2B46">25%</b></label>
          <span class="w-info" id="lm-info"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="lm-plot" width="470" height="360" style="cursor:crosshair"></canvas>
            <div class="ha-legend">Mỗi chấm = 1 pixel của ảnh mẫu (cửa sổ 7×7) tại toạ độ (λ₁, λ₂) đo được · <b>bấm 1 chấm</b> để gửi điểm đó sang widget E(u,v) và tensor viewer</div></div>
          <div style="width:230px;flex:none">
            <canvas id="lm-patch" width="112" height="112"></canvas>
            <div class="ha-legend" id="lm-patchinfo">rê chuột lên 1 chấm để soi patch 7×7 của pixel đó</div>
            <div class="card" style="padding:10px 12px;margin-top:10px">
              <b style="font-size:13px">Chốt bài toán đại số</b>
              <p style="font-size:12px;margin:0">R &gt; 0 ⟺ λ₂/λ₁ ∈ (t*, 1/t*)<br>t* = [(1−2κ) − √(1−4κ)]/(2κ)<br><b id="lm-tstar"></b><br>Miền góc = góc không gian giữa 2 tia qua gốc — kéo κ để thấy nó siết lại; κ ≥ 0.25 thì tia cụt (không còn góc).</p>
            </div>
          </div>
        </div>`;

      const plot = mount.querySelector("#lm-plot").getContext("2d");
      const CW = 470, CH = 360, ML = 48, MR = 14, MT = 14, MB = 42;
      const PW = CW - ML - MR, PH = CH - MT - MB;
      let img = null, pts = null, lamMax = 1, k = 0.04, stPct = 25, hoverPt = -1;

      IMG.sample().then(s => {
        img = s;
        const step = 3, ptsArr = [];
        for (let y = 8; y < s.h - 8; y += step)
          for (let x = 8; x < s.w - 8; x += step) {
            const P = harrisSums(s.gray, s.w, s.h, x, y, 7, 0.04);
            ptsArr.push({ x, y, lam1: P.lam1, lam2: P.lam2 });
          }
        const lams = ptsArr.map(p => p.lam1).sort((a, b) => a - b);
        lamMax = Math.max(10, lams[Math.floor(lams.length * 0.985)]);
        pts = ptsArr;
        // chọn sẵn điểm góc demo để patch preview không trống
        if (typeof REAL_HC !== "undefined" && REAL_HC.harris) {
          let bi = -1, bd0 = 1e9;
          for (let i = 0; i < pts.length; i++) {
            const d0 = Math.hypot(pts[i].x - REAL_HC.harris.x, pts[i].y - REAL_HC.harris.y);
            if (d0 < bd0) { bd0 = d0; bi = i; }
          }
          hoverPt = bi;
        }
        const st = mount.querySelector("#lm-st");
        st.max = "100";
        draw();
        showPatch(hoverPt);
        mount.querySelector("#lm-info").innerHTML = "<b>" + pts.length.toLocaleString("vi-VN") + "</b> pixel được xét — chấm xanh = góc (R &gt; 0), đỏ = cạnh (R &lt; 0), xám = phẳng";
      });

      function showPatch(i) {
        const pcv = mount.querySelector("#lm-patch").getContext("2d");
        pcv.imageSmoothingEnabled = false;
        pcv.fillStyle = "#F4F7FA"; pcv.fillRect(0, 0, 112, 112);
        if (i >= 0 && pts && img) {
          const p = pts[i];
          const tmp = document.createElement("canvas");
          IMG.putGray(tmp, img.gray, img.w, img.h);
          pcv.drawImage(tmp, p.x - 3, p.y - 3, 7, 7, 0, 0, 112, 112);
          mount.querySelector("#lm-patchinfo").innerHTML = "patch 7×7 tại (" + p.x + ", " + p.y + ") — λ₁ = " + fmtI(p.lam1) + " · λ₂ = " + fmtI(p.lam2) + " · λ₂/λ₁ = " + (p.lam2 / p.lam1).toFixed(3) + " · <b>bấm để đồng bộ 2 widget kia</b>";
        } else mount.querySelector("#lm-patchinfo").textContent = "rê chuột lên 1 chấm để soi patch 7×7 của pixel đó";
      }

      const tstar = k => (1 - 2 * k - Math.sqrt(Math.max(0, 1 - 4 * k))) / (2 * k);
      const X = v => ML + v / lamMax * PW;
      const Y = v => MT + PH - v / lamMax * PH;

      function draw() {
        if (!pts) return;
        const ts = tstar(k);
        mount.querySelector("#lm-kv").textContent = k.toFixed(2);
        mount.querySelector("#lm-tstar").innerHTML = "κ = " + k.toFixed(2) + " ⇒ t* ≈ " + ts.toFixed(4) + " (1 : " + (1 / ts).toFixed(0) + ")";
        plot.fillStyle = "#fff"; plot.fillRect(0, 0, CW, CH);
        // lưới
        plot.strokeStyle = "#EEF3F9"; plot.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
          plot.beginPath(); plot.moveTo(X(lamMax * i / 4), Y(0)); plot.lineTo(X(lamMax * i / 4), Y(lamMax)); plot.stroke();
          plot.beginPath(); plot.moveTo(X(0), Y(lamMax * i / 4)); plot.lineTo(X(lamMax), Y(lamMax * i / 4)); plot.stroke();
        }
        // miền: góc (giữa chéo và tia t*) / cạnh (dưới tia t*)
        plot.fillStyle = "rgba(14,159,110,.12)";
        plot.beginPath(); plot.moveTo(X(0), Y(0)); plot.lineTo(X(lamMax), Y(lamMax)); plot.lineTo(X(lamMax), Y(ts * lamMax)); plot.closePath(); plot.fill();
        plot.fillStyle = "rgba(224,36,36,.07)";
        plot.beginPath(); plot.moveTo(X(0), Y(0)); plot.lineTo(X(lamMax), Y(ts * lamMax)); plot.lineTo(X(lamMax), Y(0)); plot.closePath(); plot.fill();
        // điểm
        const stThresh = stPct / 100 * lamMax;
        let nC = 0, nE = 0, nF = 0, nST = 0;
        const flatCut = 0.015 * lamMax;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const px = X(p.lam1), py = Y(p.lam2);
          if (px > CW - MR || py < MT) continue;
          let col;
          if (p.lam1 < flatCut) { col = "rgba(148,163,184,.45)"; nF++; }
          else if (p.lam2 >= ts * p.lam1) { col = "rgba(14,159,110,.5)"; nC++; }
          else { col = "rgba(224,36,36,.42)"; nE++; }
          if (Math.min(p.lam1, p.lam2) >= stThresh) nST++;
          plot.fillStyle = col;
          plot.fillRect(px - 1, py - 1, 2.2, 2.2);
          if (i === hoverPt) {
            plot.strokeStyle = "#0F2B46"; plot.lineWidth = 1.6;
            plot.strokeRect(px - 3.5, py - 3.5, 7, 7);
          }
        }
        // đường biên
        plot.strokeStyle = "#94A3B8"; plot.setLineDash([5, 4]); plot.lineWidth = 1.3;
        plot.beginPath(); plot.moveTo(X(0), Y(0)); plot.lineTo(X(lamMax), Y(lamMax)); plot.stroke();
        plot.setLineDash([]);
        plot.strokeStyle = "#E67E22"; plot.lineWidth = 2;
        plot.beginPath(); plot.moveTo(X(0), Y(0)); plot.lineTo(X(lamMax), Y(ts * lamMax)); plot.stroke();
        plot.strokeStyle = "#1B5FA8"; plot.setLineDash([6, 4]); plot.lineWidth = 1.6;
        plot.beginPath(); plot.moveTo(X(0), Y(stThresh)); plot.lineTo(X(lamMax), Y(stThresh)); plot.stroke();
        plot.setLineDash([]);
        // nhãn
        plot.fillStyle = "#64748B"; plot.font = "10.5px Arial"; plot.textAlign = "center";
        plot.fillText("phẳng: gần gốc (cả hai λ ≈ 0)", X(0.26 * lamMax), Y(0.015 * lamMax) - 8);
        plot.fillStyle = "#C05F0A"; plot.textAlign = "left";
        plot.fillText("R = 0", X(0.78 * lamMax) + 4, Y(0.78 * lamMax * ts) - 6);
        plot.fillStyle = "#0E9F6E"; plot.textAlign = "right";
        plot.fillText("GÓC (R > 0)", X(0.94 * lamMax), Y(0.94 * lamMax) - 6);
        plot.fillStyle = "#E02424"; plot.textAlign = "right";
        plot.fillText("CẠNH (R < 0)", X(0.94 * lamMax), Y(0.16 * lamMax));
        plot.fillStyle = "#1B5FA8"; plot.textAlign = "left";
        plot.fillText("Shi–Tomasi: giữ nếu λ₂ ≥ ngưỡng", X(0.02 * lamMax), Y(stThresh) - 5);
        // trục
        plot.fillStyle = "#94A3B8"; plot.font = "11px Arial"; plot.textAlign = "center";
        plot.fillText("λ₁ →", ML + PW / 2, CH - 8);
        plot.save(); plot.translate(13, MT + PH / 2); plot.rotate(-Math.PI / 2);
        plot.fillText("λ₂ →", 0, 0); plot.restore();
        plot.textAlign = "right";
        for (let i = 0; i <= 4; i++) {
          const v = lamMax * i / 4;
          plot.fillText(i === 0 ? "0" : fmtI(v), ML - 4, Y(v) + 3);
          plot.fillText(fmtI(v), X(v) + 6, CH - 22);
        }
        mount.querySelector("#lm-info").innerHTML =
          "<b>" + pts.length.toLocaleString("vi-VN") + "</b> pixel: " +
          "<span style='color:#0E9F6E'><b>" + nC.toLocaleString("vi-VN") + "</b> góc</span> · " +
          "<span style='color:#E02424'><b>" + nE.toLocaleString("vi-VN") + "</b> cạnh</span> · " +
          "<span style='color:#94A3B8'><b>" + nF.toLocaleString("vi-VN") + "</b> phẳng</span> · " +
          "Shi–Tomasi giữ <b>" + nST.toLocaleString("vi-VN") + "</b>";
      }

      mount.querySelector("#lm-k").oninput = e => { k = +e.target.value; draw(); };
      mount.querySelector("#lm-st").oninput = e => { stPct = +e.target.value; mount.querySelector("#lm-stv").textContent = stPct + "%"; draw(); };

      plot.canvas.addEventListener("mousemove", e => {
        if (!pts) return;
        const r = plot.canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left) * CW / r.width, my = (e.clientY - r.top) * CH / r.height;
        let best = -1, bd = 100;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.hypot(X(pts[i].lam1) - mx, Y(pts[i].lam2) - my);
          if (d < bd) { bd = d; best = i; }
        }
        if (best !== hoverPt) {
          hoverPt = best;
          draw();
          showPatch(best);
        }
      });
      plot.canvas.addEventListener("mouseleave", () => { if (hoverPt !== -1) { hoverPt = -1; draw(); showPatch(-1); } });
      plot.canvas.addEventListener("click", () => {
        if (hoverPt >= 0 && pts) {
          const p = pts[hoverPt];
          HCPICK.emit(p.x, p.y, "từ mặt phẳng eigenvalue");
        }
      });
    }
  })();

  /* ================================================================
     WIDGET 4 — pipeline đầy đủ: R-map + ngưỡng + NMS
     ================================================================ */
  (() => {
    const mount = document.getElementById("w-hc-full");
    if (!mount) return;
    whenVisible(mount, init);

    function init() {
      mount.innerHTML = `
        <div class="w-controls">
          <label>Cửa sổ: <select id="hf-block"><option>3</option><option>5</option><option selected>7</option><option>9</option><option>11</option></select></label>
          <label>κ = <input type="range" id="hf-k" min="0.02" max="0.24" step="0.01" value="0.04"><b id="hf-kv" style="font-size:13px;color:#0F2B46">0.04</b></label>
          <label>Ngưỡng = <input type="range" id="hf-thr" min="0.1" max="10" step="0.1" value="1"><b id="hf-thrv" style="font-size:13px;color:#0F2B46">1%</b> max R</label>
          <label style="gap:4px"><input type="checkbox" id="hf-nms" checked> NMS 3×3</label>
          <span class="w-info" id="hf-stats"></span>
        </div>
        <div class="w-canvas-wrap">
          <div><canvas id="hf-heat" width="430" height="243"></canvas>
            <div class="ha-legend"><span class="sw" style="background:#1565C0"></span> R âm (cạnh) · <span class="sw" style="background:#fff;border:1px solid #D8E3F0"></span> ≈ 0 (phẳng) · <span class="sw" style="background:#FFD169"></span> → <span class="sw" style="background:#AA1428"></span> R dương (góc) — màu theo max R của ảnh</div></div>
          <div><canvas id="hf-out" width="430" height="243"></canvas>
            <div class="ha-legend"><span class="sw" style="background:#E02424"></span> góc giữ lại (R &gt; ngưỡng<span id="hf-nmstxt"> và là max cục bộ 3×3</span>) — đếm và thời gian tính ở dòng điều khiển</div></div>
        </div>`;

      let img = null, maps = null, ints = null, R = null, Rmax = 1, Rmin = -1;

      IMG.sample().then(s => {
        img = s;
        maps = gradientMaps(img.gray, img.w, img.h);
        ints = {
          xx: integral(Array.from(maps.gx, v => v * v), img.w, img.h),
          yy: integral(Array.from(maps.gy, v => v * v), img.w, img.h),
          xy: integral(Array.from(maps.gx, (v, i) => v * maps.gy[i]), img.w, img.h),
        };
        computeR();
      });

      function computeR() {
        const t0 = performance.now();
        const block = +mount.querySelector("#hf-block").value;
        const kappa = +mount.querySelector("#hf-k").value;
        const r = block >> 1, w = img.w, h = img.h, w1 = w + 1;
        R = new Float64Array(w * h);
        Rmax = 0; Rmin = 0;
        for (let y = 0; y < h; y++) {
          const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
          for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
            const Sxx = isum(ints.xx, w1, x0, y0, x1, y1);
            const Syy = isum(ints.yy, w1, x0, y0, x1, y1);
            const Sxy = isum(ints.xy, w1, x0, y0, x1, y1);
            const det = Sxx * Syy - Sxy * Sxy, trace = Sxx + Syy;
            const Rv = det - kappa * trace * trace;
            R[y * w + x] = Rv;
            if (Rv > Rmax) Rmax = Rv;
            if (Rv < Rmin) Rmin = Rv;
          }
        }
        render(performance.now() - t0);
      }

      function render(ms) {
        const w = img.w, h = img.h;
        const heat = document.createElement("canvas"); heat.width = w; heat.height = h;
        const hctx = heat.getContext("2d");
        const im = hctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const Rv = R[i];
          let col;
          // thang √ để cấu trúc R nhỏ vẫn hiện (Rmax thuộc 1 góc duy nhất, giá trị còn lại lặn sâu)
          if (Rv >= 0) col = posRamp(Math.sqrt(Rv / Rmax));
          else col = negRamp(Math.sqrt(Rv / (Rmin || -1)));
          // parse "rgb(r,g,b)"
          const m = col.match(/\d+/g);
          im.data[4 * i] = +m[0]; im.data[4 * i + 1] = +m[1]; im.data[4 * i + 2] = +m[2]; im.data[4 * i + 3] = 255;
        }
        hctx.putImageData(im, 0, 0);
        const cHeat = mount.querySelector("#hf-heat").getContext("2d");
        cHeat.imageSmoothingEnabled = true;
        cHeat.clearRect(0, 0, 430, 243);
        cHeat.drawImage(heat, 0, 0, 430, 243);

        // chọn góc
        const thrPct = +mount.querySelector("#hf-thr").value / 100;
        const nms = mount.querySelector("#hf-nms").checked;
        const thr = thrPct * Rmax;
        let nAbove = 0, nKept = 0;
        const out = document.createElement("canvas"); out.width = w; out.height = h;
        IMG.putGray(out, img.gray, w, h);
        const octx = out.getContext("2d");
        const sc = 430 / w;
        for (let y = 2; y < h - 2; y++) {
          for (let x = 2; x < w - 2; x++) {
            const Rv = R[y * w + x];
            if (Rv <= thr) continue;
            nAbove++;
            if (nms) {
              let isMax = true;
              for (let dy = -1; dy <= 1 && isMax; dy++)
                for (let dx = -1; dx <= 1 && isMax; dx++) {
                  if (!dx && !dy) continue;
                  if (R[(y + dy) * w + x + dx] > Rv) isMax = false;
                }
              if (!isMax) continue;
            }
            nKept++;
            octx.fillStyle = "#E02424";
            octx.fillRect(x - 1, y - 1, 2.6, 2.6);
          }
        }
        const cOut = mount.querySelector("#hf-out").getContext("2d");
        cOut.imageSmoothingEnabled = true;
        cOut.clearRect(0, 0, 430, 243);
        cOut.drawImage(out, 0, 0, 430, 243);
        mount.querySelector("#hf-nmstxt").textContent = nms ? " và là max cục bộ 3×3" : "";

        mount.querySelector("#hf-stats").innerHTML =
          "R<sub>max</sub> = " + fmtI(Rmax) + " · vượt ngưỡng: <b>" + nAbove.toLocaleString("vi-VN") + "</b> → giữ: <b>" + nKept.toLocaleString("vi-VN") + "</b> góc · tính R: <b>" + (ms || 0).toFixed(0) + " ms</b>" +
          (typeof REAL_HC !== "undefined" && REAL_HC.harris ? " · <span style='color:#64748B'>OpenCV cùng ngưỡng + NMS (Sobel): " + REAL_HC.harris.cvNmsN + "</span>" : "");
      }

      let tId = null;
      const onParam = () => { clearTimeout(tId); tId = setTimeout(computeR, 60); };
      mount.querySelector("#hf-block").onchange = onParam;
      mount.querySelector("#hf-k").oninput = e => { mount.querySelector("#hf-kv").textContent = (+e.target.value).toFixed(2); onParam(); };
      mount.querySelector("#hf-thr").oninput = e => { mount.querySelector("#hf-thrv").textContent = (+e.target.value).toFixed(1) + "%"; if (R) render(); };
      mount.querySelector("#hf-nms").onchange = () => { if (R) render(); };
    }
  })();

  // QA: cho node test harness import các hàm thuần (browser bỏ qua — module không tồn tại)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { harrisSums, gradientMaps, integral, isum };
  }
})();
