/* Widget "So sánh": CÙNG MỘT tấm ảnh — bật/tắt ứng viên của 2 detector.
  SIFT: cực trị DoG trên pyramid (xanh, vòng = σ) · ORB: FAST + Harris top-N (cam).
  Cả hai đều tính lại bằng JavaScript trên cùng ảnh mẫu — không phải ảnh vẽ sẵn. */
"use strict";
(() => {
  const mount = document.getElementById("w-versus");
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
        <button class="w-btn active" data-v="sift">SIFT · ứng viên DoG extrema</button>
        <button class="w-btn orange" data-v="orb">ORB · FAST + Harris top-500</button>
        <button class="w-btn" data-v="both">Chồng cả hai</button>
        <span class="w-info" id="vs-info"></span>
      </div>
      <div class="w-canvas-wrap" style="justify-content:center">
        <div>
          <canvas id="vs-canvas" width="640" height="362"></canvas>
          <p class="or-caption" style="max-width:640px" id="vs-cap"></p>
        </div>
      </div>`;

    const cv = mount.querySelector("#vs-canvas").getContext("2d");
    let data = null, orbPts = null, mode = "sift";

    Promise.all([getPyr()]).then(([d]) => {
      data = d;
      // FAST + Harris top 500 (như ORB, demo octave 0)
      let t = 10;
      let p = IMG.fastDetect(d.src.gray, d.src.w, d.src.h, t);
      while (p.length > 1400 && t < 40) { t += 5; p = IMG.fastDetect(d.src.gray, d.src.w, d.src.h, t); }
      for (const q of p) q.r = IMG.harrisAt(d.src.gray, d.src.w, d.src.h, q.x, q.y, 7, 0.04);
      orbPts = p.filter(q => q.r > 0).sort((a, b) => b.r - a.r).slice(0, 500);
      render();
    });

    function render() {
      if (!data) return;
      const s = data.src, sc = 640 / s.w;
      const tmp = document.createElement("canvas");
      IMG.putGray(tmp, s.gray, s.w, s.h);
      cv.imageSmoothingEnabled = true;
      cv.clearRect(0, 0, 640, 362);
      cv.drawImage(tmp, 0, 0, 640, 362);
      let nS = 0, nO = 0;
      if (mode === "sift" || mode === "both") {
        for (const e of data.ext) {
          const px = e.x * Math.pow(2, e.oct) * sc, py = e.y * Math.pow(2, e.oct) * sc;
          const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, e.s + 0.5) * Math.pow(2, e.oct);
          IMG.drawCircle(cv, px, py, Math.max(3, sig * 0.9 * sc), e.val > 0 ? "rgba(46,134,222,.9)" : "rgba(30,111,219,.9)", 1.5);
          nS++;
        }
      }
      if (mode === "orb" || mode === "both") {
        for (const q of orbPts) {
          cv.fillStyle = "rgba(230,126,34,.95)";
          cv.beginPath(); cv.arc(q.x * sc, q.y * sc, 2.2, 0, Math.PI * 2); cv.fill();
          nO++;
        }
      }
      mount.querySelector("#vs-info").innerHTML =
        (nS ? "<b style='color:#1B5FA8'>" + nS + "</b> ứng viên SIFT (mọi octave)" : "") +
        (nS && nO ? " · " : "") +
        (nO ? "<b style='color:#C05F0A'>" + nO + "</b> điểm ORB" : "");
      mount.querySelector("#vs-cap").innerHTML = {
        sift: "<b>SIFT</b> bắt blob / đốm theo scale: vòng tròn to nhỏ = σ khác nhau, rải từ chi tiết nhỏ đến cấu trúc lớn của bông hoa.",
        orb: "<b>ORB</b> bắt corner bằng FAST rồi Harris giữ top-500: chấm dày ở nét cánh, góc nhị — <b>không có vòng tròn scale</b> vì pyramid chỉ chọn mức, không đo σ liên tục.",
        both: "Chồng lớp: xanh = SIFT, cam = ORB. Nhiều nơi trùng nhau (đặc trưng mạnh cả 2 cách) — nhưng cũng nhiều vùng chỉ một bên bắt được: hai triết lý detector khác nhau.",
      }[mode];
    }

    mount.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
      mode = b.dataset.v;
      mount.querySelectorAll("[data-v]").forEach(x => x.classList.toggle("active", x === b));
      render();
    });
  }
})();
