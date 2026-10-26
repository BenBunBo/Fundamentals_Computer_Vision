/* Khung trang web cuộn dọc: nav + scrollspy, lazy-init widget (IntersectionObserver),
   tooltip thuật ngữ, renderer số thật (REAL) cho các tensor-box. */
"use strict";

// ---------------------------------------------------------------- lazy init
// Widget tự gọi: whenVisible(mountEl, initFn) — init đúng 1 lần khi cuộn tới (hoặc khi
// <details> chứa nó được mở). Dùng scroll/resize + poll nhẹ thay cho IntersectionObserver
// để chắc chắn chạy trong mọi môi trường (kể cả webview không dispatch IO callback).
function whenVisible(el, fn) {
  if (!el) return;
  let fired = false;
  const inView = () => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.height > 0) return r.top < vh + 300 && r.bottom > -300;
    return r.top >= 0 && r.top < vh; // phần tử chưa có chiều cao: chỉ cần nằm trong viewport
  };
  const check = () => {
    if (fired) return true;
    if (inView()) { fired = true; stop(); fn(); return true; }
    return false;
  };
  const onSR = () => check();
  window.addEventListener("scroll", onSR, { passive: true });
  window.addEventListener("resize", onSR, { passive: true });
  // không đặt hạn ticks: người đọc có thể cuộn tới widget sau vài phút — poll nhẹ (1 rect/250ms) rẻ hơn widget bị bỏ trống
  const iv = setInterval(check, 250);
  function stop() {
    window.removeEventListener("scroll", onSR);
    window.removeEventListener("resize", onSR);
    clearInterval(iv);
  }
  check();
}
window.whenVisible = whenVisible;

// ---------------------------------------------------------------- nav + scrollspy
const navLinks = Array.from(document.querySelectorAll("#topnav a"));
const spySections = Array.from(document.querySelectorAll("main > section[id]"));
function spyUpdate() {
  if (!navLinks.length || !spySections.length) return;
  let cur = spySections[0];
  for (const s of spySections) {
    if (s.getBoundingClientRect().top <= 140) cur = s;
  }
  const href = "#" + cur.id;
  navLinks.forEach(a => a.classList.toggle("cur", a.getAttribute("href") === href));
}
if (navLinks.length && spySections.length) {
  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spyUpdate(); }); };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  spyUpdate();
}

// Anchor trỏ vào <details> đang đóng ⇒ tự mở rồi mới cuộn tới.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const t = document.querySelector(a.getAttribute("href"));
  if (!t) return;
  let p = t.closest ? t.closest("details") : null;
  while (p) { if (!p.open) p.open = true; p = p.parentElement ? p.parentElement.closest("details") : null; }
});

// Nút mở/đóng tất cả panel bước: <button data-toggle-details="#sift-steps" data-mode="open">
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-toggle-details]");
  if (!b) return;
  const scope = document.querySelector(b.getAttribute("data-toggle-details"));
  if (scope) scope.querySelectorAll("details").forEach(d => d.open = b.dataset.mode === "open");
});

// Về đầu trang
const backtop = document.getElementById("backtop");
if (backtop) {
  addEventListener("scroll", () => backtop.classList.toggle("show", scrollY > 700), { passive: true });
  backtop.onclick = () => scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------- REAL renderer
// real_data.js (sinh bằng scripts/generate_assets.py) khai báo const REAL = {...}.
// HTML dùng: <span data-real="sift.lam1" data-fmt="f1"></span>
//            <div data-real-mat="harris.M" data-fmt="int"></div>
//            <div data-bits="rbrief.bits1" data-bits-vs="rbrief.bits2"></div>
function fmtVal(v, f) {
  if (typeof v !== "number") return String(v);
  if (f === "int") return Math.round(v).toLocaleString("vi-VN");
  const d = f === "f0" ? 0 : f === "f1" ? 1 : f === "f2" ? 2 : f === "f3" ? 3 : f === "f4" ? 4 : 2;
  return v.toFixed(d);
}
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }

function renderReal() {
  if (typeof REAL === "undefined") return;
  document.querySelectorAll("[data-real]").forEach(el => {
    const v = getPath(REAL, el.dataset.real);
    if (v != null) el.textContent = fmtVal(v, el.dataset.fmt);
  });
  document.querySelectorAll("[data-real-mat]").forEach(el => {
    const m = getPath(REAL, el.dataset.realMat);
    if (!Array.isArray(m) && typeof m !== "string") return;
    if (typeof m === "string") { el.textContent = m; return; } // ví dụ: chuỗi bit
    el.innerHTML = "<table class='mat'>" +
      m.map(row => "<tr>" + row.map(c => "<td>" + (typeof c === "number" ? fmtVal(c, el.dataset.fmt) : c) + "</td>").join("") + "</tr>").join("") +
      "</table>";
  });
  document.querySelectorAll("[data-bits]").forEach(el => {
    const s = getPath(REAL, el.dataset.bits);
    if (typeof s !== "string") return;
    const vs = el.dataset.bitsVs ? getPath(REAL, el.dataset.bitsVs) : null;
    const cells = [];
    for (let i = 0; i < s.length; i++) {
      const diff = vs != null && vs[i] !== undefined && vs[i] !== s[i];
      cells.push("<i class='" + (s[i] === "1" ? "b1" : "b0") + (diff ? " bd" : "") + "'></i>");
    }
    el.innerHTML = cells.join("");
    el.classList.add("bits");
  });
}
document.addEventListener("DOMContentLoaded", renderReal);

// ---------------------------------------------------------------- glossary
const GLOSS = {
  "gaussian": ["Gaussian (blur)", "Làm mờ ảnh bằng hạt nhân hình chuông Gauss — mức mờ càng lớn, chi tiết nhỏ càng biến mất, chỉ còn cấu trúc lớn.", "https://en.wikipedia.org/wiki/Gaussian_blur"],
  "dog": ["DoG — Difference of Gaussians", "Hiệu của 2 ảnh mờ ở 2 σ kề nhau. Làm nổi « blob » ở đúng scale đó, là xấp xỉ rẻ của Laplacian of Gaussian.", "https://en.wikipedia.org/wiki/Blob_detection#The_difference_of_Gaussians_approach"],
  "log": ["LoG — Laplacian of Gaussian", "Tổng đạo hàm cấp 2 theo x và y của ảnh đã làm mờ: ∇²(G∗I). Phản ứng mạnh với blob ở scale σ — « bản chuẩn » mà DoG xấp xỉ để tiết kiệm tính toán.", "https://en.wikipedia.org/wiki/Blob_detection#The_Laplacian_of_Gaussian"],
  "scale-space": ["Scale-space", "Họ các « bản dịch » của cùng một ảnh ở mọi mức mờ (σ) — cách máy tính thấy vật ở nhiều kích cỡ.", "https://en.wikipedia.org/wiki/Scale_space"],
  "octave": ["Octave", "Một « tầng » của pyramid: ảnh thu nhỏ còn một nửa. Trong một octave, σ gấp đôi — như trong âm nhạc, một quãng tám.", null],
  "sigma": ["σ (sigma)", "Độ rộng của hạt nhân Gaussian = mức làm mờ. σ lớn = nhìn xa hơn, mờ hơn. Keypoint của SIFT luôn kèm σ của chính nó.", null],
  "extrema": ["Extrema cục bộ", "Pixel có giá trị lớn hơn / nhỏ hơn tất cả 26 láng giềng trong không gian (x, y, σ) — ứng viên blob.", null],
  "blob": ["Blob", "Vùng sáng/tối tròn trịa nổi lên trên nền — ví dụ đốm hoa, chấm sáng. DoG bắt blob rất tốt.", "https://en.wikipedia.org/wiki/Blob_detection"],
  "corner": ["Corner (góc)", "Điểm mà dịch ảnh theo bất kỳ hướng nào thì vùng lân cận cũng đổi nhiều — dễ định danh, không mơ hồ như cạnh hay vùng phẳng.", "https://en.wikipedia.org/wiki/Corner_detection"],
  "keypoint": ["Keypoint", "Một điểm đặc trưng được chọn kèm toạ độ (x, y), scale σ và hướng θ — « địa chỉ » để tính descriptor.", null],
  "taylor": ["Khai triển Taylor", "Xấp xỉ hàm quanh một điểm bằng đa thức — ở đây xấp xỉ DoG bậc 2 để tìm đúng vị trí cực trị dưới-pixel.", "https://en.wikipedia.org/wiki/Taylor_series"],
  "subpixel": ["Dưới-pixel (sub-pixel)", "Vị trí chính xác hơn 1 pixel: tấm ảnh là lưới rời rạc, nhưng cực trị thật của hàm DoG thường nằm giữa các pixel — Taylor bậc 2 tìm ra lệch phân số (x̂, ŷ) đó.", null],
  "hessian": ["Hessian", "Ma trận đạo hàm cấp 2. Hessian 2×2 của DoG cho biết vùng quanh điểm cong đều (blob) hay chỉ cong 1 chiều (cạnh).", "https://en.wikipedia.org/wiki/Hessian_matrix"],
  "central-diff": ["Sai phân trung tâm", "Xấp xỉ đạo hàm từ hiệu 2 điểm hai bên: f′(x) ≈ [f(x+1) − f(x−1)]/2 · f″(x) ≈ f(x+1) + f(x−1) − 2f(x). Cách SIFT tính Dxx, Dyy, Dxy của DoG từ 9 pixel kề.", "https://en.wikipedia.org/wiki/Finite_difference"],
  "eigenvalue": ["Eigenvalue (λ)", "Giá trị riêng đo « độ cong » theo 2 trục chính. Hai λ đều lớn ⇒ góc; một lớn một nhỏ ⇒ cạnh; cả hai nhỏ ⇒ vùng phẳng.", "https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors"],
  "harris": ["Harris response", "Thước đo « độ góc » từ structure tensor: R = det(M) − κ·trace²(M). R lớn = góc thật; R âm = cạnh; R≈0 = phẳng.", "https://en.wikipedia.org/wiki/Corner_detection"],
  "structure-tensor": ["Structure tensor", "Ma trận 2×2 tổng bình phương gradient trong cửa sổ — tóm tắt « ảnh đổi mạnh theo hướng nào ».", "https://en.wikipedia.org/wiki/Structure_tensor"],
  "gradient": ["Gradient ảnh", "Đạo hàm riêng theo x, y — đo ảnh đổi sáng nhanh thế nào theo từng hướng; là nguyên liệu của mọi descriptor.", "https://en.wikipedia.org/wiki/Image_gradient"],
  "histogram": ["Histogram hướng", "Gom gradient của nhiều pixel vào các « thùng » theo góc — peak của histogram là hướng chủ đạo của vùng.", null],
  "bin": ["Bin (thùng)", "Một ô của histogram. Histogram 36 bins = 36 ô, mỗi ô gánh một cung 10° quanh vòng tròn 360°.", null],
  "moment": ["Moment ảnh", "Tổng trọng số mₚq = Σ xᵖy^q·I(x,y). m₁₀, m₀₁ cho biết « khối sáng » lệch về đâu — như tâm khối của vật thể.", "https://en.wikipedia.org/wiki/Image_moment"],
  "centroid": ["Intensity centroid", "Điểm « tâm khối sáng » C = (m₁₀/m₀₀, m₀₁/m₀₀) của patch; vector tâm→C cho hướng của corner.", null],
  "fast": ["FAST detector", "So 16 pixel trên vòng tròn quanh p: nếu ≥12 điểm liên tiếp sáng hơn/tối hơn ngưỡng ⇒ corner. Rất nhanh vì chỉ so sánh số nguyên.", "https://en.wikipedia.org/wiki/Features_from_accelerated_segment_test"],
  "brief": ["BRIEF descriptor", "Chọn ~256 cặp pixel trong patch (đã làm mờ), mỗi cặp ra 1 bit so sáng tối ⇒ descriptor 256 bit, so khớp bằng Hamming.", "https://en.wikipedia.org/wiki/BRIEF_(descriptor)"],
  "rbrief": ["rBRIEF — Rotated BRIEF", "BRIEF xoay theo θ của keypoint + học lại 256 cặp cho ít tương quan, variance cao (ORB paper §4.3) ⇒ chịu xoay tốt.", null],
  "hamming": ["Hamming distance", "Số bit khác nhau giữa 2 chuỗi bit: XOR rồi popcount. Rất rẻ — 1 lệnh máy cho 64 bit.", "https://en.wikipedia.org/wiki/Hamming_distance"],
  "ratio-test": ["Lowe ratio test", "Chỉ nhận match nếu best_dist < 0.75·second_dist — loại cặp mơ hồ khi điểm gần nhất và gần nhì gần như nhau.", null],
  "pyramid": ["Image pyramid", "Chuỗi ảnh thu nhỏ dần ½ mỗi tầng — cho detector thấy được cả chi tiết nhỏ lẫn vật lớn.", "https://en.wikipedia.org/wiki/Pyramid_(image_processing)"],
  "descriptor": ["Descriptor", "Vector số mô tả vùng quanh keypoint — « vân tay » để so sánh với descriptor khác bằng khoảng cách.", null],
  "patch": ["Patch", "Mảnh ảnh vuông quanh keypoint (SIFT: 16×16; BRIEF/ORB: 31×31) dùng để tính descriptor.", null],
  "xor": ["XOR & popcount", "XOR 2 chuỗi bit: khác nhau ra 1. Đếm số bit 1 (popcount) = Hamming distance.", null],
  "affine": ["Biến đổi affine", "Xoay + thu phóng + trượt + nghiêng — họ biến đổi phẳng mà SIFT chịu được mức nhẹ.", "https://en.wikipedia.org/wiki/Affine_transformation"],
  "slam": ["SLAM", "Simultaneous Localization And Mapping — robot/drone tự định vị và dựng bản đồ cùng lúc; ORB-SLAM dùng ORB features.", "https://en.wikipedia.org/wiki/Simultaneous_localization_and_mapping"],
  "sfm": ["SfM — Structure from Motion", "Khôi phục hình học 3D của cảnh từ nhiều ảnh chụp ở góc khác nhau, dựa trên các cặp điểm tương ứng.", "https://en.wikipedia.org/wiki/Structure_from_motion"],
  "integral": ["Integral image", "Bảng tổng cộng dồn cho phép lấy tổng một hình chữ nhật bất kỳ trong O(1) — ORB dùng để « làm mờ » nhanh từng test 5×5.", "https://en.wikipedia.org/wiki/Summed-area_table"],
  "stride": ["Stride (bước trượt)", "Khái niệm CNN: số pixel kernel « nhảy » sau mỗi vị trí nhân chập — stride 2 cho ảnh đầu ra nhỏ ~½. SIFT/ORB cổ điển KHÔNG hạ mẫu bằng stride: kernel chạy stride 1, hạ mẫu là bước decimation riêng sau khi làm mờ.", "https://en.wikipedia.org/wiki/Convolutional_neural_network"],
  "decimation": ["Decimation (hạ mẫu)", "Bỏ/gộp pixel theo chu kỳ — ví dụ lấy cách 1 pixel ⇒ ảnh nhỏ ½ mỗi chiều. Quy tắc bắt buộc: low-pass filter (làm mờ) TRƯỚC rồi mới decimate.", "https://en.wikipedia.org/wiki/Downsampling_(signal_processing)"],
  "aliasing": ["Aliasing (mô hoá)", "Hạ mẫu mà chưa bỏ tần số cao ⇒ chi tiết mảnh « trượt » thành mẫu giả (moiré, vạch nhấp nháy). Đó là lý do luôn làm mờ Gaussian trước khi decimate.", "https://en.wikipedia.org/wiki/Aliasing"],
  "luma": ["Luma (độ sáng)", "Giá trị xám Y = 0.299R + 0.587G + 0.114B — mắt người nhạy với xanh lá nên kênh G được weighted cao nhất (chuẩn ITU-R BT.601).", "https://en.wikipedia.org/wiki/Luma_(video)"],
  "kernel": ["Kernel (hạt nhân)", "Ma trận nhỏ trượt qua ảnh để tính tích chập — ví dụ Gaussian 5×5, đạo hàm Sobel 3×3. Mỗi phần tử là một trọng số.", "https://en.wikipedia.org/wiki/Kernel_(image_processing)"],
  "conv": ["Tích chập (convolution)", "Phép nhân kernel với vùng ảnh dưới nó rồi cộng lại — ra 1 pixel đầu ra; lặp cho toàn ảnh. Làm mờ, tìm biên, DoG... đều là tích chập.", "https://en.wikipedia.org/wiki/Convolution"],
  "normalize": ["Chuẩn hoá (normalization)", "Kéo vector về độ dài đơn vị (chia cho norm) — khiến descriptor không phụ thuộc độ sáng / tương phản. SIFT còn kẹp ≤ 0.2 rồi chuẩn hoá lại.", null],
};

// Tooltip là vùng tương tác được: rê chuột INTO tooltip không bị đóng (để bấm « Xem thêm →»),
// rời đi một lúc mới ẩn; bấm term = ghim; bấm ngoài / cuộn trang = đóng.
const tt = document.getElementById("tooltip");
let ttTimer = null;
function hideSoon(ms) { clearTimeout(ttTimer); ttTimer = setTimeout(hideTT, ms || 320); }
function keepTT() { clearTimeout(ttTimer); }

document.addEventListener("mouseover", (e) => {
  const t = e.target.closest(".term");
  if (!t) return;
  keepTT();
  showTT(t);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest(".term")) hideSoon(320);
});
tt.addEventListener("mouseenter", keepTT);
tt.addEventListener("mouseleave", () => hideSoon(220));
document.addEventListener("click", (e) => {
  const t = e.target.closest(".term");
  if (t) { keepTT(); showTT(t); }                 // bấm term (kể cả cảm ứng) ⇒ mở/ghim
  else if (!e.target.closest("#tooltip")) hideTT(); // bấm ngoài ⇒ đóng
});
addEventListener("scroll", () => { if (!tt.hidden) hideTT(); }, { passive: true });

function showTT(el) {
  const g = GLOSS[el.dataset.term];
  if (!g) return;
  tt.innerHTML = "<b>" + g[0] + "</b>" + g[1] +
    (g[2] ? '<br><a class="tt-link" target="_blank" rel="noopener" href="' + g[2] + '">Xem thêm →</a>' : "");
  tt.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tt.offsetWidth, hgt = tt.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  let y = r.top - hgt - 8;
  if (y < 66) y = r.bottom + 8;
  tt.style.left = x + "px"; tt.style.top = y + "px";
}
function hideTT() { clearTimeout(ttTimer); tt.hidden = true; }
