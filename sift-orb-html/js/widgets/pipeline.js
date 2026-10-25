/* Widget "Tổng quan": stepper pipeline — ảnh đầu vào đi qua 3 giai đoạn. */
"use strict";
(() => {
  const mount = document.getElementById("w-pipeline");
  if (!mount) return;
  let inited = false;
  whenVisible(mount, () => { if (!inited) { inited = true; init(); } });

  const STEPS = [
    { img: "img/sample.jpg", title: "Ảnh đầu vào", pos: 4,
      desc: "Một bức ảnh 1000×563 — chưa xử lý gì. Trước khi vào giải thuật, ảnh luôn được <b>chuyển sang ảnh xám</b> (Bước 0). Ba giai đoạn phía dưới sẽ biến nó thành tập điểm đặc trưng và vector mô tả, dùng được để so khớp với bức ảnh khác." },
    { img: "img/04_sift_keypoints.jpg", title: "① DETECT — tìm keypoint", pos: 36.3,
      desc: "Ảnh được quét qua <b>scale-space</b> (SIFT: cực trị DoG; ORB: FAST + pyramid + Harris). Kết quả: các điểm « đáng nhớ » kèm (x, y, σ). Đây là <b>168 keypoint SIFT</b> — vòng tròn = σ, vạch = hướng θ." },
    { img: "img/06_descriptor_grid.jpg", title: "② DESCRIBE — vector hoá", pos: 68.6,
      desc: "Quanh mỗi keypoint lấy cửa sổ 16×16 (đã xoay về θ), chia lưới 4×4 ô × 8 hướng gradient ⇒ <b>vector 128 chiều</b>. Mỗi keypoint giờ chỉ còn là một dãy số." },
    { img: "img/07_sift_matching.jpg", title: "③ MATCH — ghép cặp", pos: 96,
      desc: "So descriptor giữa 2 ảnh bằng <b>Euclidean</b> (SIFT) / <b>Hamming</b> (ORB) + ratio test. Kết quả: <b>80 cặp khớp</b>, dù ảnh phải đã xoay 35° và thu còn 0.72×." },
  ];

  function init() {
    mount.innerHTML = `
      <div class="w-controls">
        <button class="w-btn" id="pl-auto">▶ Tự động</button>
        <button class="w-btn" id="pl-prev">‹ Trước</button>
        <button class="w-btn" id="pl-next">Sau ›</button>
        <label><input type="checkbox" id="pl-reset" style="display:none"><span class="w-info" id="pl-count"></span></label>
      </div>
      <div class="pl-track">
        <div class="pl-line"></div><div class="pl-line-fill" id="pl-fill"></div>
        <div class="pl-token" id="pl-token"><img src="img/sample.jpg" alt=""></div>
        ${STEPS.map((s, i) => `<div class="pl-station" id="pl-st${i}" style="left:${s.pos}%"><span>${i}</span><small>${i === 0 ? "ẢNH VÀO" : ["", "DETECT", "DESCRIBE", "MATCH"][i]}</small></div>`).join("")}
      </div>
      <div class="pl-stage">
        <figure class="imgcard" style="width:430px;flex:none"><img id="pl-img" src="${STEPS[0].img}" alt=""><figcaption id="pl-cap"></figcaption></figure>
        <div class="pl-desc" id="pl-desc"></div>
      </div>`;
    const token = mount.querySelector("#pl-token"), fill = mount.querySelector("#pl-fill");
    const img = mount.querySelector("#pl-img"), desc = mount.querySelector("#pl-desc");
    const cap = mount.querySelector("#pl-cap"), count = mount.querySelector("#pl-count");
    let cur = 0, timer = null;
    const stations = STEPS.map((_, i) => mount.querySelector("#pl-st" + i));

    function render() {
      token.style.left = STEPS[cur].pos + "%";
      fill.style.width = "calc(" + STEPS[cur].pos + "% - 120px)";
      img.src = STEPS[cur].img;
      cap.textContent = STEPS[cur].title;
      desc.innerHTML = "<b class='step-title'>" + STEPS[cur].title + "</b>" + STEPS[cur].desc +
        "<p style='margin-top:8px'><a href='" + ["#buoc0", "#sift", "#sift", "#sosanh"][cur] + "' style='color:#2E86DE;font-size:12px'>→ " + ["Bước 0 · tiền xử lý ảnh", "Phần SIFT · xem detect chi tiết", "SIFT bước 4 · descriptor", "So sánh kết quả matching"][cur] + "</a></p>";
      stations.forEach((st, i) => { st.classList.toggle("cur", i === cur); st.classList.toggle("done", i < cur); });
      count.textContent = "Bước " + (cur + 1) + " / 4";
      mount.querySelector("#pl-prev").disabled = cur === 0;
      mount.querySelector("#pl-next").disabled = cur === STEPS.length - 1;
    }
    function stop() { clearInterval(timer); timer = null; mount.querySelector("#pl-auto").textContent = "▶ Tự động"; }
    mount.querySelector("#pl-prev").onclick = () => { stop(); cur--; render(); };
    mount.querySelector("#pl-next").onclick = () => { stop(); cur++; render(); };
    mount.querySelector("#pl-auto").onclick = (e) => {
      if (timer) return stop();
      if (cur === STEPS.length - 1) cur = -1;
      e.target.textContent = "⏸ Dừng";
      timer = setInterval(() => { cur++; if (cur >= STEPS.length) { cur = STEPS.length - 1; stop(); } render(); }, 2000);
      cur++; render();
    };
    render();
  }
})();
