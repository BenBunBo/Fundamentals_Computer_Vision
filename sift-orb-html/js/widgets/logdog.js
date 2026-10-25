/* Widget SIFT bước 1 (đi sâu): LoG vs DoG — chứng minh trực quan rằng
   DoG = L(x,kσ) − L(x,σ) ≈ (k−1)σ²·∇²G là xấp xỉ tốt của Laplacian of Gaussian.
   Cả hai đều tính thật trong trình duyệt: LoG bằng 2 tích chập 1D, DoG từ pyramid SIFT. */
"use strict";
(() => {
  const mount = document.getElementById("w-logdog");
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

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <label>σ = <b id="ld-sig" style="color:#0F2B46">1.60</b> (level của octave 0)
          <input type="range" id="ld-s" min="0" max="3" step="1" value="0"></label>
        <span class="w-info" id="ld-corr"></span>
      </div>
      <div class="w-canvas-wrap">
        <div>
          <canvas id="ld-log" width="430" height="243"></canvas>
          <p class="or-caption" style="text-align:center"><b>LoG σ²·∇²(G∗I)</b> — « bản chuẩn », tính bằng kernel đạo hàm cấp 2 (tốn ~2× Gaussian)</p>
        </div>
        <div>
          <canvas id="ld-dog" width="430" height="243"></canvas>
          <p class="or-caption" style="text-align:center"><b>DoG = L(kσ) − L(σ)</b> — trừ 2 mức mờ có sẵn trong pyramid (gần như miễn phí)</p>
        </div>
      </div>
      <div class="ld-section">
        <canvas id="ld-plot" width="880" height="170"></canvas>
        <p class="or-caption" style="max-width:880px">Cắt ngang 1 hàng qua giữa ảnh: hai đường gần trùng nhau — <b>đỏ</b> = LoG chuẩn hoá, <b>cam</b> = DoG chuẩn hoá. Kéo σ để xem: σ càng lớn, k = 2^(1/3) càng « sát nút », xấp xỉ càng tốt.</p>
      </div>`;

    const cLog = mount.querySelector("#ld-log"), cDog = mount.querySelector("#ld-dog");
    const plot = mount.querySelector("#ld-plot").getContext("2d");
    let data = null;

    getPyr().then(d => { data = d; render(); });

    mount.querySelector("#ld-s").oninput = (e) => { if (data) render(); };

    function render() {
      const s = +mount.querySelector("#ld-s").value;
      const pyr = data.pyr, O0 = pyr.octaves[0], w = O0.w, h = O0.h;
      const sigma = pyr.sigma0 * Math.pow(pyr.k, s);
      mount.querySelector("#ld-sig").textContent = sigma.toFixed(2);

      const src = O0.levels[0];                       // ảnh gốc của octave (σ≈1.6 pre-blur coi như I)
      const log = IMG.logOfGauss(src, w, h, sigma);   // ∇²(G_σ ∗ I)
      const dog = pyr.dogs[0].levels[s];              // L(kσ) − L(σ)

      const draw = (cv, arr, gainScale) => {
        let m = 1e-6;
        for (let i = 0; i < arr.length; i++) m = Math.max(m, Math.abs(arr[i]));
        IMG.putDog(cv, arr, w, h, 40 / m * gainScale);
      };
      draw(cLog, log, 1);
      draw(cDog, dog, 1);

      // tương quan Pearson toàn ảnh (bất biến với hệ số tỉ lệ)
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      const n = w * h;
      for (let i = 0; i < n; i++) {
        sa += log[i]; sb += dog[i]; saa += log[i] * log[i]; sbb += dog[i] * dog[i]; sab += log[i] * dog[i];
      }
      const cov = sab / n - (sa / n) * (sb / n);
      const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
      const corr = cov / Math.sqrt(Math.max(1e-12, va * vb));
      mount.querySelector("#ld-corr").innerHTML =
        "tương quan LoG ↔ DoG: <b>r = " + corr.toFixed(4) + "</b> · DoG ≈ (k−1)·σ²·LoG với k = 2^(1/3) ≈ 1.26, (k−1)·σ² = " +
        ((Math.pow(2, 1 / 3) - 1) * sigma * sigma).toFixed(1);

      // cắt ngang 1 hàng
      const row = Math.round(h * 0.42);
      const nl = [], nd = [];
      let ml = 1e-6, md = 1e-6;
      for (let x = 0; x < w; x++) {
        const a = log[row * w + x], b = dog[row * w + x];
        nl.push(a); nd.push(b);
        ml = Math.max(ml, Math.abs(a)); md = Math.max(md, Math.abs(b));
      }
      const CW = 880, CH = 170, pad = 18, mid = CH / 2;
      plot.clearRect(0, 0, CW, CH);
      plot.fillStyle = "#0F2B46"; plot.fillRect(0, 0, CW, CH);
      plot.strokeStyle = "#3E5E82"; plot.beginPath();
      plot.moveTo(pad, mid); plot.lineTo(CW - pad, mid); plot.stroke();
      const line = (arr, m, color, dash) => {
        plot.beginPath();
        for (let x = 0; x < w; x++) {
          const px = pad + x / (w - 1) * (CW - 2 * pad);
          const py = mid - arr[x] / m * (CH / 2 - 26);
          if (x === 0) plot.moveTo(px, py); else plot.lineTo(px, py);
        }
        plot.strokeStyle = color; plot.lineWidth = 2.2;
        plot.setLineDash(dash || []); plot.stroke(); plot.setLineDash([]);
      };
      line(nl, ml, "#E02424");
      line(nd, md, "#F6A04D", [7, 5]);
      plot.fillStyle = "#9FB6D0"; plot.font = "12px Arial";
      plot.fillText("hàng y = " + row + " — giá trị chuẩn hoá theo biên độ riêng (đỏ: σ²·LoG, cam: DoG)", pad, 16);
    }
  }
})();
