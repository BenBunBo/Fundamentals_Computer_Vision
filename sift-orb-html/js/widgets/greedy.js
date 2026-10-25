/* Widget ORB bước 4: thuật toán greedy của rBRIEF — học 256 cặp test ít tương quan.
   Mô phỏng đúng thuật toán ORB paper §4.3 trên patch thật của ảnh mẫu (thu nhỏ quy mô). */
"use strict";
(() => {
  const mount = document.getElementById("w-greedy");
  if (!mount) return;
  whenVisible(mount, init);

  // Demo dùng lưới 27×27 = 729 ô (đầy đủ trong patch); paper gốc đếm vùng đặt được là 26×26 = 676 ô
  const P = 31, W = 5, GRID = P - W + 1;
  const N_CAND = 2200, N_PATCH = 60, N_BITS = 256;

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <button class="w-btn orange" id="gr-step">Chọn 1 cặp</button>
        <button class="w-btn orange" id="gr-run">Chạy tới 256</button>
        <button class="w-btn" id="gr-reset">Làm lại</button>
        <span class="w-info" id="gr-prog"></span>
      </div>
      <div class="gr-cards">
        <div>
          <canvas id="gr-canvas" width="252" height="252"></canvas>
          <p class="or-caption" style="max-width:252px">Nền: 1 trong ${N_PATCH} patch huấn luyện (31×31 pixel thật từ ảnh mẫu). Mỗi đoạn thẳng = 1 cặp ô 5×5 vừa được chọn (đoạn cam = chọn gần nhất).</p>
        </div>
        <div style="flex:1;min-width:0">
          <div class="gr-note">
            <b>⚠ Greedy này KHÔNG phải thuật toán matching.</b><br>
            Đó là bước <b>« học descriptor »</b> chạy đúng một lần lúc <i>train</i> ORB: từ
            <b>205,590</b> cặp khả dĩ trong patch 31×31 (cách đếm chi tiết ở hộp phía trên), greedy chọn <b>256</b> cặp
            có mean ≈ 0.5 (variance cao nhất) và loại dần cặp tương quan cao, dựa trên
            <b>300k keypoint huấn luyện</b> (PASCAL 2006). Pattern cố định này dùng cho <b>mọi ảnh</b>.
            Matching giữa 2 ảnh vẫn là <b>Hamming + ratio test</b> — làm sau khi descriptor đã có.
          </div>
          <div class="gr-stats" id="gr-stats"></div>
          <div class="card" style="margin-top:10px;padding:10px 12px">
            <b style="font-size:13px">Thuật toán trong paper (§4.3)</b>
            <p style="font-size:12px;line-height:1.6">
              1. Chạy mọi test trên tất cả patch huấn luyện<br>
              2. Sắp test theo |mean − 0.5| tăng dần (mean 0.5 ⇒ variance 0.25 — cao nhất có thể)<br>
              3. Greedy: lấy test đầu vào R → xét test kế tiếp: |tương quan| với test nào trong R quá ngưỡng ⇒ bỏ, ngược lại ⇒ thêm vào R<br>
              4. Lặp đến khi đủ 256; nếu cạn pool ⇒ nới ngưỡng và thử lại
            </p>
          </div>
        </div>
      </div>`;

    const cv = mount.querySelector("#gr-canvas").getContext("2d");
    const progEl = mount.querySelector("#gr-prog"), statsEl = mount.querySelector("#gr-stats");
    let patches = null, cand = null, chosen = [], ptr = 0, thresh = 0.9, done = false;

    function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

    function build() {
      return IMG.sample().then(s => {
        let pts = IMG.fastDetect(s.gray, s.w, s.h, 15);
        const rand = rng(7);
        for (let y = 40; y < s.h - 40 && pts.length < 200; y += 17)
          for (let x = 40; x < s.w - 40 && pts.length < 200; x += 17)
            pts.push({ x: Math.round(x + rand() * 8), y: Math.round(y + rand() * 8) });
        for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
        patches = pts.slice(0, N_PATCH).map(p => {
          const g = new Float32Array(P * P);
          for (let dy = 0; dy < P; dy++) for (let dx = 0; dx < P; dx++)
            g[dy * P + dx] = s.gray[(p.y + dy - 15) * s.w + (p.x + dx - 15)];
          return g;
        });
        // mean 5×5 từng ô (676 ô) cho từng patch
        const means = patches.map(g => {
          const m = new Float32Array(GRID * GRID);
          for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
            let sum = 0;
            for (let dy = 0; dy < W; dy++) for (let dx = 0; dx < W; dx++) sum += g[(j + dy) * P + (i + dx)];
            m[j * GRID + i] = sum / (W * W);
          }
          return m;
        });
        // ứng viên: cặp ô không chồng lấn
        cand = [];
        let guard = 0;
        while (cand.length < N_CAND && guard++ < 60000) {
          const a = Math.floor(rand() * GRID * GRID), b = Math.floor(rand() * GRID * GRID);
          if (a === b) continue;
          const ax = a % GRID, ay = (a / GRID) | 0, bx = b % GRID, by = (b / GRID) | 0;
          if (Math.abs(ax - bx) < W && Math.abs(ay - by) < W) continue;
          // bit vector qua các patch: meanA < meanB ?
          const bits = new Uint8Array(patches.length);
          let m = 0;
          for (let p = 0; p < patches.length; p++) {
            const v = means[p][a] < means[p][b] ? 1 : 0;
            bits[p] = v; m += v;
          }
          m /= patches.length;
          cand.push({ a, b, bits, mean: m, varr: m * (1 - m) });
        }
        cand.sort((x, y) => Math.abs(x.mean - 0.5) - Math.abs(y.mean - 0.5));
        ptr = 0; chosen = []; thresh = 0.9; done = false;
        draw();
        stats();
      });
    }

    function corr(c, sel) {
      let sab = 0, sa = 0, sb = 0;
      const n = c.bits.length;
      for (let p = 0; p < n; p++) { sab += c.bits[p] * sel.bits[p]; sa += c.bits[p]; sb += sel.bits[p]; }
      const cov = sab / n - (sa / n) * (sb / n);
      const va = sa / n * (1 - sa / n), vb = sb / n * (1 - sb / n);
      if (va < 1e-9 || vb < 1e-9) return 0;
      return cov / Math.sqrt(va * vb);
    }

    function stepOnce() {
      while (ptr < cand.length) {
        const c = cand[ptr++];
        let ok = true;
        for (const r of chosen) { if (Math.abs(corr(c, r)) > thresh) { ok = false; break; } }
        if (ok) { chosen.push(c); return true; }
      }
      if (chosen.length < N_BITS && thresh < 1.0) { thresh = Math.min(1.0, thresh + 0.04); ptr = 0; return stepOnce(); }
      done = true;
      return false;
    }

    function draw() {
      const S = 8, off = 2;
      cv.fillStyle = "#0F2B46"; cv.fillRect(0, 0, 252, 252);
      if (patches) {
        const tmp = document.createElement("canvas");
        IMG.putGray(tmp, patches[0], P, P);
        cv.imageSmoothingEnabled = false;
        cv.drawImage(tmp, off, off, P * S, P * S);
      }
      const center = (idx) => ({ x: off + ((idx % GRID) + W / 2) * S, y: off + (((idx / GRID) | 0) + W / 2) * S });
      chosen.forEach((c, i) => {
        const A = center(c.a), B = center(c.b);
        cv.beginPath(); cv.moveTo(A.x, A.y); cv.lineTo(B.x, B.y);
        cv.strokeStyle = i === chosen.length - 1 ? "#E67E22" : "rgba(46,134,222,.8)";
        cv.lineWidth = i === chosen.length - 1 ? 2.2 : 1;
        cv.stroke();
        cv.fillStyle = "rgba(46,134,222,.9)";
        cv.fillRect(A.x - 1.5, A.y - 1.5, 3, 3); cv.fillRect(B.x - 1.5, B.y - 1.5, 3, 3);
      });
    }

    function stats() {
      const varr = chosen.length ? chosen.reduce((a, c) => a + c.varr, 0) / chosen.length : 0;
      progEl.innerHTML = "đã chọn <b>" + chosen.length + " / " + N_BITS + "</b> · test còn lại: " + (cand.length - ptr) +
        " · ngưỡng tương quan: " + thresh.toFixed(2) + (done ? " · <b>xong</b>" : "");
      statsEl.innerHTML = `
        <div class="gs"><b>${chosen.length}/256</b>bit đã chọn</div>
        <div class="gs"><b>${(chosen.length ? varr.toFixed(3) : "—")}</b>variance TB (max 0.25)</div>
        <div class="gs"><b>${cand ? cand.length.toLocaleString("vi") : "…"}</b>test ứng viên (demo)</div>
        <div class="gs"><b>205,590</b>test trong paper</div>`;
    }

    mount.querySelector("#gr-step").onclick = () => { if (!cand || done) return; stepOnce(); draw(); stats(); };
    mount.querySelector("#gr-run").onclick = () => {
      if (!cand || done) return;
      let guard = 0;
      while (chosen.length < N_BITS && !done && guard++ < 4000) if (!stepOnce()) break;
      draw(); stats();
    };
    mount.querySelector("#gr-reset").onclick = () => { if (cand) { ptr = 0; chosen = []; thresh = 0.9; done = false; draw(); stats(); } };

    build();
  }
})();
