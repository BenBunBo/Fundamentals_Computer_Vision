/* Widget SIFT bước 1: image pyramid explorer — octave × level, Gaussian / DoG + extrema.
   Pyramid dùng chung (window.__PYR) với widget orientation và localize. */
"use strict";
(() => {
  const mount = document.getElementById("w-pyramid");
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
        <button class="w-btn active" id="py-view-g">Gaussian L</button>
        <button class="w-btn" id="py-view-d">DoG</button>
        <label>Level <input type="range" id="py-lev" min="1" max="6" value="1"></label>
        <label><input type="checkbox" id="py-ext" checked> Ứng viên keypoint (DoG extrema)</label>
        <span class="w-info" id="py-info"></span>
      </div>
      <div class="w-canvas-wrap">
        <div class="py-main"><canvas id="py-canvas" width="460" height="260"></canvas><div class="py-badge" id="py-badge"></div></div>
        <div>
          <div class="py-grid" id="py-grid"></div>
          <p class="w-info" style="max-width:330px;margin-top:8px">Mỗi hàng = 1 <b>octave</b> (ảnh thu nhỏ còn ½). Trong một octave, ảnh được làm mờ dần qua <b>6 mức</b>; DoG = hiệu 2 mức kề nhau (5 ảnh DoG). Ô viền cam = đang xem.</p>
        </div>
      </div>`;

    const canvas = mount.querySelector("#py-canvas"), ctx = canvas.getContext("2d");
    const info = mount.querySelector("#py-info"), badge = mount.querySelector("#py-badge");
    const grid = mount.querySelector("#py-grid");
    let oct = 0, lev = 1, view = "g", data = null;

    mount.querySelector("#py-view-g").onclick = () => setView("g");
    mount.querySelector("#py-view-d").onclick = () => setView("d");
    function setView(v) {
      view = v;
      mount.querySelector("#py-view-g").classList.toggle("active", v === "g");
      mount.querySelector("#py-view-d").classList.toggle("active", v === "d");
      if (v === "d" && lev < 2) lev = 2;
      mount.querySelector("#py-lev").value = lev;
      render();
    }
    mount.querySelector("#py-lev").oninput = (e) => {
      lev = +e.target.value;
      if (view === "d" && lev < 2) { lev = 2; e.target.value = 2; }
      render();
    };
    mount.querySelector("#py-ext").onchange = render;

    // grid 4 octave × 6 level, cell size = ½ theo octave (mỗi octave 1 hàng flex)
    for (let o = 0; o < 4; o++) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:3px;align-items:flex-end";
      const lbl = document.createElement("div");
      lbl.className = "py-oct-label"; lbl.style.width = "44px"; lbl.textContent = "oct " + o;
      row.appendChild(lbl);
      for (let l = 0; l < 6; l++) {
        const c = document.createElement("div");
        c.className = "py-cell";
        const hgt = Math.max(6, Math.round(44 / (1 << o)));
        c.style.height = hgt + "px";
        c.style.width = Math.round(hgt * 1.768) + "px";
        c.dataset.o = o; c.dataset.l = l + 1;
        c.title = "Octave " + o + " · Level " + (l + 1) + " — bấm để xem";
        c.onclick = () => { oct = o; lev = l + 1; if (view === "d" && lev < 2) lev = 2; mount.querySelector("#py-lev").value = lev; render(); };
        row.appendChild(c);
      }
      grid.appendChild(row);
    }

    function render() {
      const O = data.pyr.octaves[oct], D = data.pyr.dogs[oct];
      const w = O.w, h = O.h;
      const s = Math.min(canvas.width / w, canvas.height / h);
      const dw = Math.round(w * s), dh = Math.round(h * s);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const tmp = document.createElement("canvas");
      const showLev = (view === "d") ? Math.max(1, lev) : lev;
      if (view === "d") {
        IMG.putDog(tmp, D.levels[showLev - 1], w, h, 1.0);
      } else {
        IMG.putGray(tmp, O.levels[lev - 1], w, h);
      }
      ctx.drawImage(tmp, 0, 0, dw, dh);
      if (mount.querySelector("#py-ext").checked && view === "d") {
        for (const e of data.ext) {
          if (e.oct !== oct || e.s !== showLev - 1) continue;
          const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, e.s + 0.5);
          IMG.drawCircle(ctx, e.x * s, e.y * s, Math.max(4, 2.2 * sig * s), e.val > 0 ? "#FFD166" : "#7EB8F0", 1.4);
        }
      }
      badge.textContent = (view === "d" ? "DoG" : "Gaussian") + " — " + w + "×" + h + " px";
      const sig = data.pyr.sigma0 * Math.pow(data.pyr.k, lev - 1);
      info.innerHTML = "Octave <b>" + oct + "</b> · Level <b>" + lev + "</b>/6 · σ = <b>" + sig.toFixed(2) + "</b>" +
        (oct > 0 ? " (= 1.6 × 2^" + oct + "×)" : "") + " · k = 2^(1/3) ≈ 1.26";
      // grid highlight
      grid.querySelectorAll(".py-cell").forEach(c => {
        const co = +c.dataset.o, cl = +c.dataset.l;
        c.classList.toggle("cur", co === oct && cl === lev);
        c.classList.toggle("done", co === oct && cl < lev);
      });
    }

    getPyr().then(d => { data = d; render(); });
  }
})();
