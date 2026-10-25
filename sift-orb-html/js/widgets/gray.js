/* Widget Bước 0: ảnh màu → ảnh xám. Toggle kênh R/G/B/Luma + soi ma trận 5×5 pixel
   tại điểm bấm — hiện 3 ma trận kênh và ma trận xám Y = 0.299R+0.587G+0.114B. */
"use strict";
(() => {
  const mount = document.getElementById("w-gray");
  if (!mount) return;
  whenVisible(mount, init);

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <span style="font-size:12.5px;color:#64748B">Xem kênh:</span>
        <button class="w-btn active" data-ch="rgb">Màu gốc</button>
        <button class="w-btn" data-ch="r">R</button>
        <button class="w-btn" data-ch="g">G</button>
        <button class="w-btn" data-ch="b">B</button>
        <button class="w-btn" data-ch="y" style="color:#0F2B46"><b>Y (xám)</b></button>
        <span class="w-info" id="gr-note"></span>
      </div>
      <div class="grd-wrap">
        <div>
          <canvas id="gr-canvas" width="520" height="294" style="cursor:crosshair"></canvas>
          <p class="or-caption"><b>Bấm vào bất kỳ đâu trên ảnh</b> để soi khối pixel 5×5 tại đó (ô vuông đỏ) — giá trị từng kênh và kết quả luma hiện ở bảng bên phải.</p>
        </div>
        <div class="grd-mats">
          <div class="grd-mat"><small>R — đỏ (0.299·)</small><div id="gr-mr"></div></div>
          <div class="grd-mat"><small>G — xanh lá (0.587·)</small><div id="gr-mg"></div></div>
          <div class="grd-mat"><small>B — xanh dương (0.114·)</small><div id="gr-mb"></div></div>
          <div class="grd-mat grd-my"><small>Y = xám đầu ra</small><div id="gr-my"></div></div>
          <div class="grd-calc" id="gr-calc"></div>
        </div>
      </div>`;

    const cv = mount.querySelector("#gr-canvas").getContext("2d");
    const W = 520, H = 294;
    let mode = "rgb", pick = { x: -1, y: -1 }, D = null, w = 0, h = 0;

    IMG.loadSampleColor(640).then(s => { D = s.data; w = s.w; h = s.h; pick = { x: Math.round(w * 0.62), y: Math.round(h * 0.38) }; render(); });

    function render() {
      if (!D) return;
      const tmp = document.createElement("canvas");
      tmp.width = w; tmp.height = h;
      const tctx = tmp.getContext("2d");
      const im = tctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const R = D[4 * i], G = D[4 * i + 1], B = D[4 * i + 2];
        let r = R, g = G, b = B;
        if (mode === "r") { g = b = 0; }
        else if (mode === "g") { r = b = 0; }
        else if (mode === "b") { r = g = 0; }
        else if (mode === "y") {
          const Y = 0.299 * R + 0.587 * G + 0.114 * B;
          r = g = b = Y;
        }
        im.data[4 * i] = r; im.data[4 * i + 1] = g; im.data[4 * i + 2] = b; im.data[4 * i + 3] = 255;
      }
      tctx.putImageData(im, 0, 0);
      cv.imageSmoothingEnabled = true;
      cv.drawImage(tmp, 0, 0, W, H);
      // ô chọn 5×5
      const sx = W / w, sy = H / h;
      cv.strokeStyle = "#E02424"; cv.lineWidth = 2;
      cv.strokeRect((pick.x - 2) * sx - .5, (pick.y - 2) * sy - .5, 5 * sx + 1, 5 * sy + 1);
      updateMats();
      mount.querySelector("#gr-note").innerHTML = {
        rgb: "ảnh gốc 640×362 — 3 kênh màu, mỗi pixel 3 số (R, G, B)",
        r: "chỉ kênh đỏ — thấy « bản đồ nhiệt » đỏ của ảnh",
        g: "chỉ kênh xanh lá — <b>sáng nhất</b> trong 3 kênh vì mắt người nhạy màu này nhất",
        b: "chỉ kênh xanh dương — tối nhất",
        y: "Y = 0.299·R + 0.587·G + 0.114·B — <b>đây là ảnh SIFT / ORB thật sự nhìn thấy</b>",
      }[mode];
    }

    function matHTML(vals) {
      return "<table class='mat'>" + vals.map(row => "<tr>" + row.map(v => "<td>" + Math.round(v) + "</td>").join("") + "</tr>").join("") + "</table>";
    }

    function updateMats() {
      if (!D) return;
      const R = [], G = [], B = [], Y = [];
      for (let dy = -2; dy <= 2; dy++) {
        const rR = [], rG = [], rB = [], rY = [];
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.max(0, Math.min(w - 1, pick.x + dx)), y = Math.max(0, Math.min(h - 1, pick.y + dy));
          const i = y * w + x;
          const r = D[4 * i], g = D[4 * i + 1], b = D[4 * i + 2];
          rR.push(r); rG.push(g); rB.push(b); rY.push(0.299 * r + 0.587 * g + 0.114 * b);
        }
        R.push(rR); G.push(rG); B.push(rB); Y.push(rY);
      }
      mount.querySelector("#gr-mr").innerHTML = matHTML(R);
      mount.querySelector("#gr-mg").innerHTML = matHTML(G);
      mount.querySelector("#gr-mb").innerHTML = matHTML(B);
      mount.querySelector("#gr-my").innerHTML = matHTML(Y);
      const cy = 2, cx = 2;
      mount.querySelector("#gr-calc").innerHTML =
        "pixel giữa (hàng " + (cy + 1) + ", cột " + (cx + 1) + "):<br>" +
        "Y = 0.299·<b>" + Math.round(R[cy][cx]) + "</b> + 0.587·<b>" + Math.round(G[cy][cx]) +
        "</b> + 0.114·<b>" + Math.round(B[cy][cx]) + "</b> = <b>" + Y[cy][cx].toFixed(1) + "</b>";
    }

    mount.querySelectorAll("[data-ch]").forEach(b => b.onclick = () => {
      mode = b.dataset.ch;
      mount.querySelectorAll("[data-ch]").forEach(x => x.classList.toggle("active", x === b));
      render();
    });
    mount.querySelector("#gr-canvas").addEventListener("click", (e) => {
      if (!D) return;
      const r = e.target.getBoundingClientRect();
      pick = {
        x: Math.max(2, Math.min(w - 3, Math.round((e.clientX - r.left) / r.width * w))),
        y: Math.max(2, Math.min(h - 3, Math.round((e.clientY - r.top) / r.height * h))),
      };
      render();
    });
  }
})();
