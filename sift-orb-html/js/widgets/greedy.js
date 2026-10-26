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
            <b style="font-size:13px">Mean &amp; variance của 1 test — từ đâu ra?</b>
            <p style="font-size:12px;line-height:1.6">
              1 test τ = 1 phép so sáng tối giữa 2 ô 5×5. Chạy τ qua <b>N patch huấn luyện</b> ⇒ N bit b₁ … b_N ∈ {0, 1}:<br>
              • <b>mean μ(τ) = (b₁ + … + b_N) / N</b> — đơn giản là <i>tỉ lệ patch cho bit 1</i><br>
              • bit là biến Bernoulli ⇒ <b>variance = μ·(1 − μ)</b> — đạt max <b>0.25 khi μ = 0.5</b><br>
              μ = 0.5 ⇒ test chia đôi tập patch ⇒ « biết nhiều » nhất; μ ≈ 0 hoặc 1 ⇒ luôn cùng kết quả ⇒ vô dụng. Vì vậy greedy <b>sort theo |μ − 0.5| tăng dần</b> (tương đương variance giảm dần) rồi mới lọc tương quan.
            </p>
          </div>
          <p class="links" style="margin-top:8px">📖 Thuật toán greedy đầy đủ: <a href="https://sites.cc.gatech.edu/classes/AY2024/cs4475_summer/images/ORB_an_efficient_alternative_to_SIFT_or_SURF.pdf" target="_blank" rel="noopener">ORB paper §4.3</a> · cách tính lại con số 205.590: <a href="https://gilscvblog.com/2013/10/04/a-tutorial-on-binary-descriptors-part-3-the-orb-descriptor" target="_blank" rel="noopener">Gil's CV Blog</a></p>
        </div>
      </div>

      <div class="gl-panel">
        <div class="gl-head"><b>🔬 Soi từng bước greedy — test đang xét &amp; kết quả xét</b></div>
        <canvas id="gl-bits" width="620" height="64" style="max-width:100%"></canvas>
        <p class="gl-canvas-cap">mỗi ô = kết quả (bit) của test này trên 1 patch huấn luyện — cam = bit 1, xám = bit 0</p>
        <div class="gl-nums" id="gl-nums"></div>
        <div class="gl-log" id="gl-log"></div>
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
        nTried = 0; nRejected = 0; lastEvent = null;
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

    let lastEvent = null, nTried = 0, nRejected = 0;

    function stepOnce() {
      while (ptr < cand.length) {
        const c = cand[ptr++];
        nTried++;
        let maxCorr = -1, maxIdx = -1;
        for (let i = 0; i < chosen.length; i++) {
          const cc = Math.abs(corr(c, chosen[i]));
          if (cc > maxCorr) { maxCorr = cc; maxIdx = i; }
        }
        if (chosen.length && maxCorr > thresh) {
          nRejected++;
          lastEvent = { c, idx: ptr - 1, accepted: false, maxCorr, maxIdx };
          continue;
        }
        chosen.push(c);
        lastEvent = { c, idx: ptr - 1, accepted: true, maxCorr, maxIdx };
        return true;
      }
      if (chosen.length < N_BITS && thresh < 1.0) {
        thresh = Math.min(1.0, thresh + 0.04); ptr = 0;
        lastEvent = { relax: true };
        return stepOnce();
      }
      done = true;
      return false;
    }

    function drawInspector() {
      const cv = mount.querySelector("#gl-bits").getContext("2d");
      const CW = 620, CH = 64;
      cv.clearRect(0, 0, CW, CH);
      const e = lastEvent;
      const test = e && e.c ? e.c : (cand && cand[ptr] ? cand[ptr] : null);
      const numsEl = mount.querySelector("#gl-nums"), logEl = mount.querySelector("#gl-log");
      if (!test) {
        numsEl.innerHTML = "<i>bấm « Chọn 1 cặp » để bắt đầu</i>";
        logEl.innerHTML = "";
        return;
      }
      const n = test.bits.length, bw = (CW - 16) / n;
      for (let p = 0; p < n; p++) {
        cv.fillStyle = test.bits[p] ? "#E67E22" : "#DDE5EF";
        cv.fillRect(8 + p * bw, 16, Math.max(2, bw - 1.2), 32);
      }
      cv.fillStyle = "#94A3B8"; cv.font = "10px Arial"; cv.textAlign = "left";
      cv.fillText(e ? (e.accepted ? "✔ test vừa CHỌN — thứ tự trong hàng đợi: #" + (e.idx + 1) : "✘ test vừa LOẠI — thứ tự trong hàng đợi: #" + (e.idx + 1)) : "test kế tiếp trong hàng đợi (|μ − 0.5| nhỏ nhất còn lại)", 8, 9);
      cv.fillText("patch huấn luyện 1 → " + n, 8, CH - 8);
      const ones = test.bits.reduce((a, b) => a + b, 0);
      const mu = ones / n, varr = mu * (1 - mu);
      let h = "μ = " + ones + "/" + n + " = <b>" + mu.toFixed(3) + "</b> ⇒ variance = μ·(1−μ) = <b>" + varr.toFixed(3) + "</b> <span style='color:#94A3B8'>(max 0.25 khi μ = 0.5)</span>";
      if (e && e.c) {
        h += e.accepted
          ? " · corr max với R: <b>" + (e.maxIdx >= 0 ? e.maxCorr.toFixed(2) : "—") + "</b> ⇒ <b style='color:#0E9F6E'>CHỌN</b>"
          : " · corr với test #" + (e.maxIdx + 1) + " đã chọn = <b>" + e.maxCorr.toFixed(2) + "</b> &gt; ngưỡng " + thresh.toFixed(2) + " ⇒ <b style='color:#E02424'>LOẠI</b>";
      }
      numsEl.innerHTML = h;
      logEl.innerHTML = "đã xét <b>" + nTried + "</b> test: <b style='color:#0E9F6E'>" + chosen.length + " CHỌN</b> · <b style='color:#E02424'>" + nRejected + " LOẠI</b> · ngưỡng tương quan: " + thresh.toFixed(2) + (e && e.relax ? " · <b>vừa nới ngưỡng +0.04 vì cạn pool</b>" : "");
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
      drawInspector();
    }

    mount.querySelector("#gr-step").onclick = () => { if (!cand || done) return; stepOnce(); draw(); stats(); };
    mount.querySelector("#gr-run").onclick = () => {
      if (!cand || done) return;
      let guard = 0;
      while (chosen.length < N_BITS && !done && guard++ < 4000) if (!stepOnce()) break;
      draw(); stats();
    };
    mount.querySelector("#gr-reset").onclick = () => { if (cand) { ptr = 0; chosen = []; thresh = 0.9; done = false; nTried = 0; nRejected = 0; lastEvent = null; draw(); stats(); } };

    build();
  }
})();
