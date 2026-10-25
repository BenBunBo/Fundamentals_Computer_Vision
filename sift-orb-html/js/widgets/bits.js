/* Widget rBRIEF: so 2 descriptor 256-bit THẬT (tính bằng OpenCV trên ảnh mẫu) —
   1 cặp là cùng một bông hoa giữa 2 ảnh (một ảnh đã xoay 35°), 1 cặp là 2 điểm khác nhau.
   XOR rồi đếm bit 1 ⇒ Hamming distance. Dữ liệu do scripts/generate_assets.py sinh. */
"use strict";
(() => {
  const mount = document.getElementById("w-bits");
  if (!mount) return;
  whenVisible(mount, init);

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <button class="w-btn orange active" data-pair="match">Cặp khớp tốt (cùng 1 điểm, 2 ảnh)</button>
        <button class="w-btn" data-pair="far">Cặp ngẫu nhiên (2 điểm khác nhau)</button>
        <span class="w-info" id="bt-info"></span>
      </div>
      <div class="w-canvas-wrap" style="justify-content:center">
        <div>
          <canvas id="bt-canvas" width="880" height="150"></canvas>
          <p class="or-caption" style="max-width:880px" id="bt-cap"></p>
        </div>
      </div>`;

    const cv = mount.querySelector("#bt-canvas").getContext("2d");
    let mode = "match";

    if (typeof REAL === "undefined" || !REAL.rbrief || !REAL.rbrief.match) {
      mount.querySelector("#bt-cap").innerHTML = "<i>Chưa có dữ liệu thật — chạy <code>.venv/bin/python scripts/generate_assets.py</code> để sinh <code>js/real_data.js</code>.</i>";
      return;
    }
    render();

    function hamming(a, b) {
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      return n;
    }

    function render() {
      const p = REAL.rbrief[mode];
      const CW = 880, CH = 150, x0 = 10, bw = (CW - 2 * x0) / 256;
      const rows = [
        ["descriptor ảnh 1", p.bits1],
        ["descriptor ảnh 2", p.bits2],
        ["XOR", null],
      ];
      cv.clearRect(0, 0, CW, CH);
      rows.forEach(([label, bits], ri) => {
        const y = 16 + ri * 44;
        cv.fillStyle = "#64748B"; cv.font = "11.5px Arial"; cv.textAlign = "left";
        cv.fillText(label, x0, y - 4);
        const b2 = bits === null ? null : bits;
        for (let i = 0; i < 256; i++) {
          const on = b2 === null ? (p.bits1[i] !== p.bits2[i] ? 1 : 0) : (b2[i] === "1" ? 1 : 0);
          const diff = p.bits1[i] !== p.bits2[i];
          if (b2 === null) {
            cv.fillStyle = on ? "#E02424" : "#E3EAF2";
          } else {
            cv.fillStyle = on ? (diff ? "#E67E22" : "#2E86DE") : "#DDE5EF";
          }
          cv.fillRect(x0 + i * bw, y, Math.max(1.5, bw - 1), 24);
        }
      });
      const h = hamming(p.bits1, p.bits2);
      const pct = Math.round(h / 256 * 100);
      mount.querySelector("#bt-info").innerHTML = "Hamming = <b>" + h + "/256 bit</b> (" + pct + "%)";
      mount.querySelector("#bt-cap").innerHTML = mode === "match"
        ? "Hai descriptor của <b>cùng một điểm</b> (ảnh 2 đã xoay 35° + thu nhỏ + sáng hơn): rBRIEF xoay pattern theo θ nên phần lớn bit giữ nguyên — chỉ <b>" + h + " bit</b> lật. Ngưỡng khớp thường ≤ 64 (25%)."
        : "Hai descriptor của <b>2 điểm không liên quan</b>: bit khác nhau gần như ngẫu nhiên ~50% ⇒ Hamming lớn (<b>" + h + "</b>). Đây chính là cách Hamming « phân biệt » điểm đúng / sai.";
    }

    mount.querySelectorAll("[data-pair]").forEach(b => b.onclick = () => {
      mode = b.dataset.pair;
      mount.querySelectorAll("[data-pair]").forEach(x => x.classList.toggle("active", x === b));
      render();
    });
  }
})();
