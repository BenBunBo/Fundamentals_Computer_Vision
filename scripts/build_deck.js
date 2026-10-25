// Build SIFT & ORB presentation — run: node scripts/build_deck.js (from project root)
const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE";
p.author = "ZCode";
p.title = "SIFT & ORB trong Computer Vision";

const W = 13.33, H = 7.5, M = 0.5;
const C = {
  navy: "0F2B46", navyDark: "0B2036", panel: "F4F7FA", panelDark: "1C3E63",
  blue: "2E86DE", blueDark: "1B5FA8", orange: "E67E22", orangeDark: "C05F0A",
  green: "0E9F6E", red: "D64545",
  text: "0F2B46", gray: "64748B", grayLight: "94A3B8",
  white: "FFFFFF", light: "DCE7F5", lightMut: "9FB6D0",
};
const F = "Arial";
const A = "assets/";
const R = { // aspect ratios (w/h) of generated assets
  pipeline: 3.507, feature: 2.544, gaussdog: 2.227, octaves: 2.627, siftkp: 1.651,
  orient: 2.023, descgrid: 0.919, siftmatch: 2.2, fast: 2.462, orbpyr: 3.376,
  centroid: 2.28, brief: 1.799, orbmatch: 1.186, bench: 2.303, hero: 1.774, img1: 1.776,
};
const FILES = {
  pipeline: A + "00_pipeline.png", feature: A + "01_feature_concept.png", gaussdog: A + "02_gaussian_dog.png",
  octaves: A + "03_octaves.png", siftkp: A + "04_sift_keypoints.png", orient: A + "05_orientation.png",
  descgrid: A + "06_descriptor_grid.png", siftmatch: A + "07_sift_matching.png", fast: A + "08_fast.png",
  orbpyr: A + "09_orb_pyramid.png", centroid: A + "10_centroid.png", brief: A + "11_brief.png",
  orbmatch: A + "12_orb_matching.png", bench: A + "13_benchmark.png", hero: A + "hero.png",
};
let pageNo = 0;
const bu = () => ({ code: "2022", indent: 12 });
const shadow = () => ({ type: "outer", color: "0F2B46", blur: 7, offset: 2, angle: 90, opacity: 0.18 });

function footer(s) {
  pageNo++;
  if (pageNo === 1) return;
  s.addText("SIFT & ORB — Computer Vision", { x: M, y: 7.12, w: 4.5, h: 0.3, fontFace: F, fontSize: 12, color: C.grayLight, margin: 0 });
  s.addText(String(pageNo).padStart(2, "0"), { x: W - M - 0.7, y: 7.12, w: 0.7, h: 0.3, fontFace: F, fontSize: 12, color: C.grayLight, align: "right", margin: 0 });
}

function header(s, kicker, title, accent) {
  s.addText(kicker, { x: M, y: 0.32, w: 9, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: accent, charSpacing: 2, margin: 0 });
  s.addText(title, { x: M, y: 0.62, w: W - 2 * M, h: 0.62, fontFace: F, fontSize: 30, bold: true, color: C.text, margin: 0 });
}

function imgCard(s, key, x, y, w, h, dark) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.14, y: y - 0.14, w: w + 0.28, h: h + 0.28, rectRadius: 0.09,
    fill: { color: dark ? C.panelDark : C.panel }, line: { color: dark ? "2A4E77" : "E3EAF2", width: 1 },
    shadow: shadow(),
  });
  s.addImage({ path: FILES[key], x, y, w, h });
}

function bullets(s, items, x, y, w, h, opts = {}) {
  const arr = items.map((it, i) => ({
    text: typeof it === "string" ? it : it.t,
    options: {
      bullet: bu(), breakLine: true,
      bold: typeof it === "object" && it.bold,
      color: (typeof it === "object" && it.color) || opts.color || C.text,
    },
  }));
  s.addText(arr, {
    x, y, w, h, fontFace: F, fontSize: opts.size || 16, color: opts.color || C.text,
    paraSpaceAfter: opts.gap ?? 10, margin: 0, valign: "top", lineSpacingMultiple: 1.12,
  });
}

function badge(s, n, x, y, d, color) {
  s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color: C.white, width: 1.5 } });
  s.addText(String(n), { x, y: y - 0.015, w: d, h: d, fontFace: F, fontSize: d > 0.5 ? 20 : 15, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
}

function arrow(s, x1, y, x2, color) {
  s.addShape(p.shapes.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color, width: 2.75, endArrowType: "triangle" } });
}

// ================================================================ 1 · TITLE
(() => {
  const s = p.addSlide();
  s.background = { path: FILES.hero };
  s.addShape(p.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: H, fill: { color: C.navyDark, transparency: 30 } });
  s.addText("COMPUTER VISION · LOCAL FEATURES", { x: 0.9, y: 1.55, w: 11.5, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: C.lightMut, charSpacing: 3, margin: 0 });
  s.addText([
    { text: "SIFT", options: { color: C.blue } },
    { text: "  &  ", options: { color: C.white } },
    { text: "ORB", options: { color: C.orange } },
  ], { x: 0.85, y: 2.0, w: 11.6, h: 1.35, fontFace: F, fontSize: 72, bold: true, margin: 0 });
  s.addText("Feature Detection & Description — hiểu từng bước cách hai giải thuật hoạt động",
    { x: 0.9, y: 3.5, w: 10.8, h: 0.55, fontFace: F, fontSize: 21, color: C.light, margin: 0 });
  const chip = (x, w, txt, col) => {
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 4.45, w, h: 0.62, rectRadius: 0.09, fill: { color: C.navyDark, transparency: 18 }, line: { color: col, width: 1.5 } });
    s.addText(txt, { x, y: 4.45, w, h: 0.62, fontFace: F, fontSize: 14.5, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  };
  chip(0.9, 5.4, "SIFT — Scale-Invariant Feature Transform (2004)", C.blue);
  chip(6.55, 5.4, "ORB — Oriented FAST & Rotated BRIEF (2011)", C.orange);
  s.addText("Toàn bộ hình minh họa được chạy thật bằng OpenCV 5.0 trên cùng một ảnh mẫu",
    { x: 0.9, y: 6.55, w: 11, h: 0.4, fontFace: F, fontSize: 13, italic: true, color: C.lightMut, margin: 0 });
  footer(s);
})();

// ================================================================ 2 · AGENDA
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "NỘI DUNG", "Lộ trình của bài trình bày", C.navy);
  const rows = [
    ["Local feature là gì?", "Vì sao ảnh cần « điểm đặc trưng » và pipeline 3 bước", C.navy],
    ["SIFT — 4 bước", "Scale-space · localization · orientation · descriptor 128-D", C.blue],
    ["ORB — 4 bước", "FAST · pyramid + Harris · intensity centroid · rBRIEF 256-bit", C.orange],
    ["So sánh & ứng dụng", "Bảng so sánh, benchmark thật, khi nào dùng giải thuật nào", C.green],
  ];
  rows.forEach((r, i) => {
    const y = 1.72 + i * 1.28;
    badge(s, i + 1, 0.55, y, 0.62, r[2]);
    s.addText(r[0], { x: 1.45, y: y - 0.06, w: 5.6, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: C.text, margin: 0 });
    s.addText(r[1], { x: 1.45, y: y + 0.36, w: 5.9, h: 0.45, fontFace: F, fontSize: 14, color: C.gray, margin: 0 });
    if (i < rows.length - 1)
      s.addShape(p.shapes.LINE, { x: 1.45, y: y + 1.02, w: 5.7, h: 0, line: { color: "E3EAF2", width: 1 } });
  });
  imgCard(s, "siftkp", 7.85, 1.9, 5.0, 5.0 / R.siftkp);
  s.addText("Keypoint SIFT trên ảnh mẫu (chạy thật OpenCV)", { x: 7.85, y: 1.9 + 5.0 / R.siftkp + 0.22, w: 5.0, h: 0.35, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 3 · FEATURE CONCEPT
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "KHÁI NIỆM NỀN", "Local feature là gì và vì sao cần nó?", C.navy);
  const cols = [
    ["Keypoint = điểm « đáng nhớ »", "Góc, đốm (blob), mẫu ảnh cục bộ — nhìn phát nhận ra ngay", C.blue],
    ["Chống biến đổi hình học & sáng", "Vẫn tìm lại được khi ảnh xoay, phóng / thu, đổi sáng, đổi góc nhìn", C.orange],
    ["Nền của nhiều bài toán CV", "Matching, panorama, nhận diện vật thể, SLAM, 3D reconstruction", C.green],
  ];
  cols.forEach((c, i) => {
    const x = 0.5 + i * 4.28;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 1.5, w: 4.05, h: 1.42, rectRadius: 0.08, fill: { color: C.panel }, line: { color: "E3EAF2", width: 1 } });
    s.addText(c[0], { x: x + 0.22, y: 1.64, w: 3.6, h: 0.4, fontFace: F, fontSize: 15.5, bold: true, color: c[2], margin: 0 });
    s.addText(c[1], { x: x + 0.22, y: 2.06, w: 3.65, h: 0.75, fontFace: F, fontSize: 13, color: C.text, margin: 0 });
  });
  const iw = 9.2, ih = iw / R.feature;
  imgCard(s, "feature", (W - iw) / 2, 3.02, iw, ih);
  s.addText("Ba vùng lấy từ ảnh mẫu: vùng phẳng « vô danh » — cạnh vẫn mơ hồ khi dịch chuyển — góc thì định danh duy nhất",
    { x: 1.57, y: 3.02 + ih + 0.12, w: 10.2, h: 0.4, fontFace: F, fontSize: 12.5, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 4 · PIPELINE
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "TỔNG QUAN", "Mọi giải thuật feature đều đi qua 3 giai đoạn", C.navy);
  const iw = 11.6, ih = iw / R.pipeline;
  imgCard(s, "pipeline", (W - iw) / 2, 1.55, iw, ih);
  const cols = [
    ["① DETECT — tìm ở đâu", "Quét ảnh, chọn các điểm « đặc biệt »: corner, blob. SIFT dùng DoG, ORB dùng FAST.", C.blue],
    ["② DESCRIBE — trông như thế nào", "Mã hoá vùng lân cận thành vector: SIFT 128 số thực, ORB 256 bit nhị phân.", C.green],
    ["③ MATCH — ghép cặp ra sao", "So khoảng cách vector (Euclidean / Hamming) giữa các ảnh để tìm điểm tương ứng.", C.orange],
  ];
  cols.forEach((c, i) => {
    const x = 0.5 + i * 4.28;
    s.addText(c[0], { x, y: 4.98, w: 4.05, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: c[2], margin: 0 });
    s.addText(c[1], { x, y: 5.4, w: 4.05, h: 1.05, fontFace: F, fontSize: 13.5, color: C.text, margin: 0 });
  });
  s.addText("SIFT và ORB giải quyết cùng một bài toán — nhưng cách làm ở từng bước khác hẳn nhau",
    { x: 0.5, y: 6.55, w: 12.33, h: 0.4, fontFace: F, fontSize: 13.5, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 5 · SECTION: SIFT
(() => {
  const s = p.addSlide();
  s.background = { color: C.navy };
  s.addText("PHẦN 1 / 2", { x: 0.9, y: 1.15, w: 6, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.lightMut, charSpacing: 3, margin: 0 });
  s.addText("SIFT", { x: 0.82, y: 1.5, w: 6.5, h: 1.5, fontFace: F, fontSize: 84, bold: true, color: C.blue, margin: 0 });
  s.addText("Scale-Invariant Feature Transform", { x: 0.9, y: 3.1, w: 6.6, h: 0.5, fontFace: F, fontSize: 22, bold: true, color: C.white, margin: 0 });
  s.addText("David G. Lowe — ICCV 1999 & IJCV 2004. « Gold standard » của feature detection: chính xác, bất biến xoay / scale / sáng trong nhiều năm.",
    { x: 0.9, y: 3.72, w: 6.5, h: 0.95, fontFace: F, fontSize: 15, color: C.light, margin: 0 });
  const steps = ["Scale-space extrema (DoG)", "Keypoint localization", "Orientation assignment", "Descriptor 128-D"];
  steps.forEach((t, i) => {
    const y = 4.95 + i * 0.52;
    badge(s, i + 1, 0.9, y, 0.4, C.blue);
    s.addText(t, { x: 1.48, y: y - 0.03, w: 5.8, h: 0.45, fontFace: F, fontSize: 15.5, color: C.white, valign: "middle", margin: 0 });
  });
  imgCard(s, "siftmatch", 8.05, 2.35, 4.55, 4.55 / R.siftmatch, true);
  s.addText("SIFT match 2 ảnh: phải đã xoay 35° + thu nhỏ", { x: 8.05, y: 2.35 + 4.55 / R.siftmatch + 0.25, w: 4.55, h: 0.6, fontFace: F, fontSize: 12, italic: true, color: C.lightMut, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 6 · SIFT 4 STEPS OVERVIEW
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · TỔNG QUAN", "4 bước biến một tấm ảnh thành tập vector đặc trưng", C.blue);
  const steps = [
    ["Scale-space extrema", "Tìm ứng viên keypoint ở mọi tỉ lệ bằng hiệu hai lần làm mờ Gaussian (DoG)"],
    ["Keypoint localization", "Tinh chỉnh vị trí bằng Taylor; loại điểm yếu tương phản và điểm nằm trên cạnh"],
    ["Orientation assignment", "Gán hướng θ theo histogram gradient — chìa khoá để bất biến xoay"],
    ["Descriptor 128-D", "Lưới 4×4 ô × 8 hướng gradient quanh keypoint → vector chuẩn hoá"],
  ];
  steps.forEach((t, i) => {
    const x = 0.5 + i * 3.22, y = 1.85, w = 2.86;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 3.1, rectRadius: 0.1, fill: { color: C.panel }, line: { color: "D8E3F0", width: 1 }, shadow: shadow() });
    badge(s, i + 1, x + w / 2 - 0.31, y + 0.3, 0.62, C.blue);
    s.addText(t[0], { x: x + 0.15, y: y + 1.05, w: w - 0.3, h: 0.75, fontFace: F, fontSize: 15.5, bold: true, color: C.navy, align: "center", margin: 0 });
    s.addText(t[1], { x: x + 0.2, y: y + 1.8, w: w - 0.4, h: 1.2, fontFace: F, fontSize: 12, color: C.gray, align: "center", margin: 0 });
    if (i < 3) arrow(s, x + w + 0.05, y + 1.55, x + w + 0.36, C.blue);
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 2.1, y: 5.65, w: 9.1, h: 0.85, rectRadius: 0.09, fill: { color: "EAF2FB" }, line: { color: C.blue, width: 1.25 } });
  s.addText([
    { text: "Ý tưởng cốt lõi:  ", options: { bold: true, color: C.blueDark } },
    { text: "làm mọi thứ trong « hệ toạ độ riêng » của keypoint — theo scale và hướng θ — nên ảnh xoay / phóng to bao nhiêu, descriptor vẫn giống nhau.", options: { color: C.text } },
  ], { x: 2.35, y: 5.65, w: 8.6, h: 0.85, fontFace: F, fontSize: 14, valign: "middle", margin: 0 });
  footer(s);
})();

// ================================================================ 7 · SIFT STEP 1 — SCALE SPACE + DoG
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · BƯỚC 1/4", "Scale-space: tìm điểm đặc trưng ở mọi độ phóng đại", C.blue);
  bullets(s, [
    "Làm mờ ảnh bằng Gaussian với chuỗi hệ số σ tăng dần theo tỉ số k = √2",
    "Trừ hai mức mờ liên tiếp → ảnh DoG (Difference of Gaussians)",
    "So sánh mỗi pixel với 26 láng giềng (8 cùng mức + 9×2 mức σ kề trên dưới)",
    "Là cực đại / cực tiểu cục bộ ⇒ ứng viên keypoint ở scale σ đó",
  ], 0.5, 1.62, 4.15, 3.4, { size: 15, gap: 12 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.25, w: 4.15, h: 1.35, rectRadius: 0.09, fill: { color: "EAF2FB" }, line: { color: C.blue, width: 1.25 } });
  s.addText([
    { text: "D(x, σ) = L(x, kσ) − L(x, σ)", options: { bold: true, fontSize: 17, color: C.blueDark, breakLine: true } },
    { text: "DoG ≈ xấp xỉ LoG (Laplacian of Gaussian): responsive với blob mà tính nhanh hơn nhiều", options: { fontSize: 12, color: C.gray } },
  ], { x: 0.75, y: 5.38, w: 3.7, h: 1.1, fontFace: F, margin: 0 });
  const iw = 7.85, ih = iw / R.gaussdog;
  imgCard(s, "gaussdog", 4.95, 1.7, iw, ih);
  s.addText("Trên: ảnh làm mờ dần theo σ · Dưới: hiệu DoG tương ứng (đỏ = sáng hơn, xanh = tối hơn) — vùng sáng/tối nổi bật chính là « blob »",
    { x: 4.95, y: 1.7 + ih + 0.24, w: iw, h: 0.55, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 8 · SIFT STEP 1 — OCTAVES
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · BƯỚC 1/4 (TIẾP)", "Image pyramid: cùng một phép biến đổi, lặp lại ở mọi kích thước ảnh", C.blue);
  const iw = 10.6, ih = iw / R.octaves;
  imgCard(s, "octaves", (W - iw) / 2, 1.45, iw, ih);
  const cols = [
    ["Octave = « tầng » của pyramid", "Ảnh được thu nhỏ ½ mỗi octave; σ khởi đầu cũng nhân đôi, để DoG không lặp lại vô ích."],
    ["Nhiều octave ⇒ nhiều scale", "Chi tiết nhỏ chỉ nổi bật ở octave gốc; vật thể lớn chỉ nổi bật ở octave đã thu nhỏ."],
    ["Keypoint mạnh = ổn định nhiều scale", "Điểm là cực trị qua nhiều mức σ thường chịu được biến đổi hình học tốt hơn."],
  ];
  cols.forEach((c, i) => {
    const x = 0.5 + i * 4.28;
    s.addText(c[0], { x, y: 5.55, w: 4.05, h: 0.4, fontFace: F, fontSize: 14.5, bold: true, color: C.blueDark, margin: 0 });
    s.addText(c[1], { x, y: 5.97, w: 4.05, h: 1.05, fontFace: F, fontSize: 13, color: C.text, margin: 0 });
  });
  s.addText("Thực nghiệm trong paper: 4 octave × 5 mức σ cho ảnh thường là đủ (OpenCV dùng mặc định 4–5 octave)",
    { x: 0.5, y: 6.6, w: 12.33, h: 0.4, fontFace: F, fontSize: 12.5, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 9 · SIFT STEP 2 — LOCALIZATION
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · BƯỚC 2/4", "Keypoint localization: giữ điểm ổn định, loại nhiễu", C.blue);
  bullets(s, [
    { t: "Tinh chỉnh vị trí tới độ chính xác dưới-pixel bằng khai triển Taylor bậc 2 của DoG" },
    { t: "Loại điểm tương phản thấp:  |D| < 0.03 ⇒ dễ là nhiễu, tìm lại không được" },
    { t: "Loại điểm trên cạnh: cạnh có nhiều cực trị « giả » kéo dài theo đường thẳng" },
    { t: "Dùng Hessian 2×2 của DoG: nếu tỉ số eigenvalue lớn hơn 10 ⇒ nghiêng về cạnh, loại bỏ" },
  ], 0.5, 1.62, 4.35, 3.6, { size: 15, gap: 12 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.45, w: 4.35, h: 1.15, rectRadius: 0.09, fill: { color: "EAF2FB" }, line: { color: C.blue, width: 1.25 } });
  s.addText([
    { text: "Kết quả trên ảnh mẫu: 168 keypoints", options: { bold: true, fontSize: 16, color: C.blueDark, breakLine: true } },
    { text: "sống sót qua 2 bộ lọc — mỗi điểm mang (x, y, σ) riêng", options: { fontSize: 12.5, color: C.gray } },
  ], { x: 0.75, y: 5.62, w: 3.9, h: 0.85, fontFace: F, margin: 0 });
  const iw = 7.6, ih = iw / R.siftkp;
  imgCard(s, "siftkp", 5.15, 1.55, iw, ih);
  s.addText("Vòng tròn = kích thước σ của keypoint · vạch ngang = hướng θ (gán ở bước 3)",
    { x: 5.15, y: 1.55 + ih + 0.22, w: iw, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 10 · SIFT STEP 3 — ORIENTATION
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · BƯỚC 3/4", "Orientation assignment: gán « la bàn » cho từng keypoint", C.blue);
  bullets(s, [
    "Tính gradient của mọi pixel trong lân cận keypoint (cửa sổ Gauss, σ = 1.5·σ_kp)",
    "Gom độ lớn gradient vào histogram 36 bins (mỗi bin 10°), trọng số theo khoảng cách",
    "Cột cao nhất ⇒ hướng chủ đạo θ được gán cho keypoint",
    "Cột ≥ 80% cột cao nhất ⇒ thêm keypoint thứ hai cùng vị trí, khác θ",
  ], 0.5, 1.62, 3.95, 3.4, { size: 14.5, gap: 11 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.35, w: 3.95, h: 1.25, rectRadius: 0.09, fill: { color: "EAF2FB" }, line: { color: C.blue, width: 1.25 } });
  s.addText([
    { text: "θ = atan2(L(x, y+1) − L(x, y−1),  L(x+1, y) − L(x−1, y))", options: { bold: true, fontSize: 12.5, color: C.blueDark, breakLine: true } },
    { text: "Xoay toàn bộ hệ đo về θ = 0° trước khi tính descriptor (bước 4) ⇒ bất biến xoay", options: { fontSize: 12, color: C.gray } },
  ], { x: 0.7, y: 5.5, w: 3.6, h: 1.0, fontFace: F, margin: 0 });
  const iw = 8.1, ih = iw / R.orient;
  imgCard(s, "orient", 4.72, 1.75, iw, ih);
  s.addText("Trái: hướng gradient thật từng pixel quanh một keypoint · Phải: histogram 36 bins với cột peak được đánh dấu",
    { x: 4.72, y: 1.75 + ih + 0.22, w: iw, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 11 · SIFT STEP 4 — DESCRIPTOR
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · BƯỚC 4/4", "Descriptor: « vân tay » 128 chiều của keypoint", C.blue);
  const ih = 4.9, iw = ih * R.descgrid;
  imgCard(s, "descgrid", 0.72, 1.55, iw, ih);
  s.addText("Lưới 4×4 vẽ trên patch thật — mỗi ô là một histogram 8 hướng (tính từ gradient thật)",
    { x: 0.72, y: 1.55 + ih + 0.18, w: iw, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  const xr = iw + 1.35, wr = W - xr - 0.5;
  bullets(s, [
    "Lấy cửa sổ 16×16 pixel quanh keypoint — đã xoay về θ = 0°, scales theo σ",
    "Chia thành lưới 4×4 ô, mỗi ô dựng histogram 8 hướng gradient",
    "Nối 16 ô × 8 số = 128 chiều ⇒ một vector duy nhất cho mỗi keypoint",
    "Chuẩn hoá đơn vị độ dài + kẹp giá trị ≤ 0.2 rồi chuẩn hoá lại ⇒ bất biến sáng / tương phản",
  ], xr, 1.62, wr, 2.7, { size: 15, gap: 11 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: xr, y: 4.55, w: wr, h: 1.5, rectRadius: 0.1, fill: { color: C.panel }, line: { color: "D8E3F0", width: 1 }, shadow: shadow() });
  s.addText([
    { text: "4 × 4 × 8  =  128-D", options: { fontSize: 30, bold: true, color: C.blueDark, breakLine: true } },
    { text: "vector float — « dấu vân tay » so sánh được bằng khoảng cách Euclidean", options: { fontSize: 12.5, color: C.gray } },
  ], { x: xr + 0.3, y: 4.72, w: wr - 0.6, h: 1.2, fontFace: F, margin: 0 });
  s.addText("Hai patch trông giống nhau ⇒ hai vector 128-D gần nhau, dù ảnh đã xoay / thu phóng / đổi sáng",
    { x: xr, y: 6.3, w: wr, h: 0.6, fontFace: F, fontSize: 13, italic: true, color: C.gray, margin: 0 });
  footer(s);
})();

// ================================================================ 12 · SIFT MATCHING RESULT
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SIFT · KẾT QUẢ", "Matching: ghép điểm giữa hai ảnh đã bị biến đổi", C.blue);
  s.addText([
    { text: "Lowe ratio test:  ", options: { bold: true, color: C.blueDark } },
    { text: "chỉ giữ match nếu khoảng cách gần nhất < 0.75 × khoảng cách gần nhì — loại bỏ các cặp « mơ hồ »", options: { color: C.text } },
  ], { x: 0.5, y: 1.32, w: 12.33, h: 0.4, fontFace: F, fontSize: 14.5, margin: 0 });
  const iw = 9.9, ih = iw / R.siftmatch;
  imgCard(s, "siftmatch", (W - iw) / 2, 1.78, iw, ih);
  const stats = [["168", "keypoints ảnh trái"], ["134", "keypoints ảnh phải (biến đổi)"], ["80", "cặp khớp tốt (ratio 0.75)"]];
  stats.forEach((t, i) => {
    const x = 2.2 + i * 3.1;
    s.addText(t[0], { x, y: 6.32, w: 2.9, h: 0.48, fontFace: F, fontSize: 27, bold: true, color: C.blueDark, margin: 0 });
    s.addText(t[1], { x, y: 6.82, w: 2.9, h: 0.3, fontFace: F, fontSize: 12, color: C.gray, margin: 0 });
  });
  footer(s);
})();

// ================================================================ 13 · SECTION: ORB
(() => {
  const s = p.addSlide();
  s.background = { color: C.navy };
  s.addText("PHẦN 2 / 2", { x: 0.9, y: 1.15, w: 6, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.lightMut, charSpacing: 3, margin: 0 });
  s.addText("ORB", { x: 0.82, y: 1.5, w: 6.5, h: 1.5, fontFace: F, fontSize: 84, bold: true, color: C.orange, margin: 0 });
  s.addText("Oriented FAST and Rotated BRIEF", { x: 0.9, y: 3.1, w: 6.6, h: 0.5, fontFace: F, fontSize: 22, bold: true, color: C.white, margin: 0 });
  s.addText("Rublee, Rabaud, Konolige & Bradski — ICCV 2011 (OpenCV Labs). Ghép FAST + BRIEF, thêm scale & orientation: nhanh hơn SIFT ~1–2 bậc độ lớn, miễn phí hoàn toàn.",
    { x: 0.9, y: 3.72, w: 6.5, h: 0.95, fontFace: F, fontSize: 15, color: C.light, margin: 0 });
  const parts = [["FAST + pyramid + Harris", "detector — tìm keypoint nhanh, có scale"], ["Intensity centroid", "gán hướng θ cho keypoint"], ["rBRIEF (steered)", "descriptor 256-bit bất biến xoay"]];
  parts.forEach((t, i) => {
    const y = 4.95 + i * 0.62;
    s.addShape(p.shapes.OVAL, { x: 0.95, y: y + 0.1, w: 0.22, h: 0.22, fill: { color: C.orange } });
    s.addText([
      { text: t[0] + "  —  ", options: { bold: true, color: C.white } },
      { text: t[1], options: { color: C.lightMut } },
    ], { x: 1.4, y: y, w: 6.2, h: 0.5, fontFace: F, fontSize: 15, valign: "middle", margin: 0 });
  });
  imgCard(s, "orbmatch", 8.05, 2.1, 4.55, 4.55 / R.orbmatch, true);
  s.addText("ORB match cùng cặp ảnh như SIFT", { x: 8.05, y: 2.1 + 4.55 / R.orbmatch + 0.25, w: 4.55, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.lightMut, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 14 · ORB OVERVIEW
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · TỔNG QUAN", "Công thức của ORB: FAST (detect) + rBRIEF (describe)", C.orange);
  const chain = [
    ["Ảnh", "mỗi level của pyramid", C.gray],
    ["oFAST", "FAST + pyramid + Harris ranking", C.orange],
    ["θ centroid", "hướng từng keypoint", C.orange],
    ["rBRIEF", "256-bit descriptor", C.orange],
    ["Vector", "so khớp Hamming", C.green],
  ];
  chain.forEach((c, i) => {
    const x = 0.5 + i * 2.62, y = 1.75, w = 2.3;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 1.7, rectRadius: 0.1, fill: { color: i === 0 || i === 4 ? C.panel : "FDF0E3" }, line: { color: i === 0 || i === 4 ? "D8E3F0" : "F0C9A4", width: 1.25 }, shadow: shadow() });
    s.addText(c[0], { x: x + 0.1, y: y + 0.18, w: w - 0.2, h: 0.5, fontFace: F, fontSize: 17, bold: true, color: i === 0 || i === 4 ? C.navy : C.orangeDark, align: "center", margin: 0 });
    s.addText(c[1], { x: x + 0.15, y: y + 0.75, w: w - 0.3, h: 0.8, fontFace: F, fontSize: 12, color: C.gray, align: "center", margin: 0 });
    if (i < 4) arrow(s, x + w + 0.03, y + 0.85, x + w + 0.29, C.orange);
  });
  const chips = [
    ["Vì sao cần ORB?", "SIFT có patent (đến 2020) và chậm — robot / drone / điện thoại cần feature real-time, miễn phí.", C.orange],
    ["Đổi chính xác lấy tốc độ", "Descriptor binary « thô » hơn float của SIFT nhưng đủ tốt — và nhanh hơn ~1–2 bậc độ lớn.", C.blue],
    ["Trở thành chuẩn thực tế", "Nền tảng của ORB-SLAM, cookie của nhiều pipeline AR / mobile / edge device.", C.green],
  ];
  chips.forEach((c, i) => {
    const x = 0.5 + i * 4.28, y = 4.05;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.05, h: 2.6, rectRadius: 0.08, fill: { color: C.panel }, line: { color: "E3EAF2", width: 1 } });
    s.addText(c[0], { x: x + 0.22, y: y + 0.2, w: 3.6, h: 0.4, fontFace: F, fontSize: 15, bold: true, color: c[2], margin: 0 });
    s.addText(c[1], { x: x + 0.22, y: y + 0.68, w: 3.62, h: 1.75, fontFace: F, fontSize: 12.5, color: C.text, margin: 0 });
  });
  footer(s);
})();

// ================================================================ 15 · ORB STEP 1 — FAST
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · BƯỚC 1/4", "FAST: phát hiện corner bằng phép so sánh sáng tối", C.orange);
  const rows = [
    "Xét 16 pixel trên vòng tròn bán kính 3 quanh điểm ứng viên p",
    "Corner nếu ≥ 12/16 điểm liên tiếp đều sáng hơn p + t  hoặc  tối hơn p − t (ngưỡng t)",
    "Siêu nhanh — chỉ phép so sánh số nguyên, không phải tính đạo hàm như DoG / Harris",
  ];
  rows.forEach((t, i) => {
    const y = 1.46 + i * 0.54;
    s.addShape(p.shapes.OVAL, { x: 0.55, y: y + 0.13, w: 0.2, h: 0.2, fill: { color: C.orange } });
    s.addText(t, { x: 0.95, y, w: 11.9, h: 0.5, fontFace: F, fontSize: 15.5, color: C.text, valign: "middle", margin: 0 });
  });
  const iw = 9.2, ih = iw / R.fast;
  imgCard(s, "fast", (W - iw) / 2, 3.08, iw, ih);
  s.addText("Trái: cơ chế vòng 16 điểm (cung xanh = chuỗi điểm sáng liên tiếp) · Phải: FAST chạy thật — chỉ corners, chưa có scale & orientation",
    { x: 3.0, y: 3.08 + ih + 0.16, w: 7.33, h: 0.38, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 16 · ORB STEP 2 — PYRAMID + HARRIS
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · BƯỚC 2/4", "Pyramid + Harris: bổ sung scale và chọn điểm mạnh nhất", C.orange);
  const rows = [
    "Chạy FAST trên từng level của image pyramid (mỗi level thu nhỏ ½) ⇒ có bất biến scale",
    "Tính Harris response cho mọi FAST keypoint, xếp hạng và giữ top-N điểm « góc » rõ nhất",
    "Paper: N = 500 keypoints, phân bố đều về đều theo x (giảm cụm dồn vào một vùng)",
  ];
  rows.forEach((t, i) => {
    const y = 1.5 + i * 0.56;
    s.addShape(p.shapes.OVAL, { x: 0.55, y: y + 0.13, w: 0.2, h: 0.2, fill: { color: C.orange } });
    s.addText(t, { x: 0.95, y, w: 11.9, h: 0.52, fontFace: F, fontSize: 15.5, color: C.text, valign: "middle", margin: 0 });
  });
  const iw = 11.7, ih = iw / R.orbpyr;
  imgCard(s, "orbpyr", (W - iw) / 2, 3.24, iw, ih);
  s.addText("FAST chạy thật trên 4 level của pyramid — số keypoint ở mỗi level chênh nhau theo chi tiết ảnh",
    { x: 0.7, y: 3.24 + ih + 0.18, w: 11.93, h: 0.38, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 17 · ORB STEP 3 — CENTROID
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · BƯỚC 3/4", "Intensity centroid: xác định hướng θ bằng « tâm khối sáng »", C.orange);
  bullets(s, [
    "Coi cường độ sáng của pixel như « khối lượng »: vùng sáng ⇒ tâm khối lệch về phía đó",
    "Tính moment trên patch quanh keypoint:  m₁₀ = Σ x·I(x,y),   m₀₁ = Σ y·I(x,y)",
    "Vector từ tâm patch tới centroid chỉ hướng θ của keypoint",
    "Nhanh hơn histogram 36 bins của SIFT, vẫn ổn định ở góc xoay lớn",
  ], 0.5, 1.62, 4.0, 3.3, { size: 14.5, gap: 11 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.2, w: 4.0, h: 1.4, rectRadius: 0.09, fill: { color: "FDF0E3" }, line: { color: C.orange, width: 1.25 } });
  s.addText([
    { text: "θ = atan2(m₀₁, m₁₀)", options: { bold: true, fontSize: 19, color: C.orangeDark, breakLine: true } },
    { text: "chỉ 2 phép moment + 1 atan2 cho mỗi keypoint", options: { fontSize: 12, color: C.gray } },
  ], { x: 0.75, y: 5.38, w: 3.55, h: 1.1, fontFace: F, margin: 0 });
  const iw = 7.9, ih = iw / R.centroid;
  imgCard(s, "centroid", 4.85, 1.8, iw, ih);
  s.addText("Trái: patch thật — tâm patch (+), centroid sáng hơn (○) và hướng θ · Phải: patch xoay chuẩn hoá về θ = 0° trước khi trích rBRIEF",
    { x: 4.85, y: 1.8 + ih + 0.22, w: iw, h: 0.55, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 18 · ORB STEP 4 — rBRIEF
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · BƯỚC 4/4", "rBRIEF: descriptor 256-bit bất biến xoay", C.orange);
  bullets(s, [
    "BRIEF gốc: chọn 256 cặp pixel ngẫu nhiên trong patch 31×31, so sáng tối ra 256 bit",
    "rBRIEF « steered »: xoay toạ độ các cặp theo θ của keypoint trước khi so sánh",
    "Chọn bộ cặp tối ưu bằng thuật toán greedy (giảm tương quan giữa các bit, tăng khả năng phân biệt)",
    "So khớp 2 chuỗi bit = Hamming distance: XOR rồi đếm bit 1 — phần cứng làm trong 1 lệnh",
  ], 0.5, 1.62, 4.55, 3.6, { size: 14.5, gap: 11 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.5, w: 4.55, h: 1.15, rectRadius: 0.1, fill: { color: C.panel }, line: { color: "E3EAF2", width: 1 }, shadow: shadow() });
  s.addText([
    { text: "256 bit = 32 byte", options: { fontSize: 24, bold: true, color: C.orangeDark, breakLine: true } },
    { text: "so với 128 số thực = 512 byte của SIFT (nhỏ hơn 16 lần)", options: { fontSize: 12.5, color: C.gray } },
  ], { x: 0.8, y: 5.65, w: 4.0, h: 0.9, fontFace: F, margin: 0 });
  const iw = 7.15, ih = iw / R.brief;
  imgCard(s, "brief", 5.5, 1.6, iw, ih);
  s.addText("Trái: pattern ngẫu nhiên của BRIEF · Phải: pattern xoay theo θ (rBRIEF steered) — mỗi đoạn thẳng là một cặp pixel cần so sánh",
    { x: 5.5, y: 1.6 + ih + 0.22, w: iw, h: 0.55, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  footer(s);
})();

// ================================================================ 19 · ORB MATCHING RESULT
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ORB · KẾT QUẢ", "ORB trên cùng cặp ảnh: nhanh và vẫn khớp tốt", C.orange);
  const ih = 5.05, iw = ih * R.orbmatch;
  imgCard(s, "orbmatch", 0.72, 1.5, iw, ih);
  s.addText("Trên: keypoints ORB · Dưới: 80 matches tốt nhất (Hamming + ratio test 0.8)",
    { x: 0.72, y: 1.5 + ih + 0.2, w: iw, h: 0.36, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  const xr = iw + 1.45, wr = W - xr - 0.5;
  const stats = [
    ["653", "keypoints (nfeatures = 800)"],
    ["80", "cặp khớp tốt trên ảnh biến đổi"],
    ["9.4 ms", "detect + describe / ảnh (SIFT: 85.3 ms)"],
  ];
  stats.forEach((t, i) => {
    const y = 1.62 + i * 1.3;
    s.addText(t[0], { x: xr, y, w: wr, h: 0.62, fontFace: F, fontSize: 38, bold: true, color: C.orangeDark, margin: 0 });
    s.addText(t[1], { x: xr, y: y + 0.62, w: wr, h: 0.4, fontFace: F, fontSize: 13, color: C.gray, margin: 0 });
    if (i < 2) s.addShape(p.shapes.LINE, { x: xr, y: y + 1.12, w: wr, h: 0, line: { color: "E3EAF2", width: 1 } });
  });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: xr, y: 5.6, w: wr, h: 1.05, rectRadius: 0.09, fill: { color: "FDF0E3" }, line: { color: C.orange, width: 1.25 } });
  s.addText("≈ 9× nhanh hơn SIFT trên cùng máy — đủ chuẩn để chạy 30–60 fps trên CPU thường",
    { x: xr + 0.22, y: 5.6, w: wr - 0.44, h: 1.05, fontFace: F, fontSize: 13.5, bold: true, color: C.orangeDark, valign: "middle", margin: 0 });
  footer(s);
})();

// ================================================================ 20 · COMPARISON TABLE
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "SO SÁNH", "SIFT vs ORB — cùng mục tiêu, hai triết lý khác nhau", C.navy);
  const th = { fill: { color: C.navy }, color: C.white, bold: true, fontFace: F, fontSize: 12.5, valign: "middle" };
  const c1 = { fontFace: F, fontSize: 11.5, color: "1B5FA8", bold: true, valign: "middle" };
  const c2 = { fontFace: F, fontSize: 11.5, color: "C05F0A", bold: true, valign: "middle" };
  const cl = { fontFace: F, fontSize: 11.5, color: C.text, valign: "middle" };
  const rows = [
    [{ text: "Tiêu chí", options: th }, { text: "SIFT", options: { ...th, fill: { color: "1B5FA8" } } }, { text: "ORB", options: { ...th, fill: { color: "C05F0A" } } }],
    [{ text: "Ra đời", options: c1 }, { text: "Lowe, 1999 / 2004", options: cl }, { text: "Rublee et al., ICCV 2011", options: cl }],
    [{ text: "Detector", options: c1 }, { text: "Cực trị DoG trên scale-space", options: cl }, { text: "FAST + pyramid + Harris", options: cl }],
    [{ text: "Orientation", options: c1 }, { text: "Histogram 36 bins gradient", options: cl }, { text: "Intensity centroid", options: cl }],
    [{ text: "Descriptor", options: c1 }, { text: "128-D float (512 byte)", options: cl }, { text: "256-bit binary (32 byte)", options: cl }],
    [{ text: "So khớp", options: c1 }, { text: "Euclidean (float)", options: cl }, { text: "Hamming (XOR — rất nhanh)", options: cl }],
    [{ text: "Bất biến", options: c1 }, { text: "Xoay · scale · sáng · affine nhẹ", options: cl }, { text: "Xoay · scale · sáng", options: cl }],
    [{ text: "Tốc độ", options: c1 }, { text: "Chuẩn mực, chậm hơn", options: cl }, { text: "Nhanh hơn ~1–2 bậc độ lớn", options: cl }],
    [{ text: "License", options: c1 }, { text: "Có patent — hết hạn 2020", options: cl }, { text: "Miễn phí (BSD)", options: cl }],
    [{ text: "Dùng khi", options: c1 }, { text: "Cần chính xác tối đa, ảnh biến đổi mạnh", options: cl }, { text: "Real-time: SLAM, drone, AR, mobile", options: cl }],
  ];
  s.addTable(rows, {
    x: 0.5, y: 1.42, w: 6.6, colW: [1.55, 2.5, 2.55], rowH: 0.47,
    border: { pt: 0.75, color: "DCE5EF" }, fill: { color: C.white }, margin: 0.06,
    align: "left",
  });
  const iw = 5.35, ih = iw / R.bench;
  imgCard(s, "bench", 7.42, 1.62, iw, ih);
  s.addText("Benchmark thật: detect + describe trên ảnh 1000×563, trung bình 30 lần chạy (OpenCV 5.0, CPU của máy này)",
    { x: 7.42, y: 1.62 + ih + 0.2, w: iw, h: 0.6, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center", margin: 0 });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.42, y: 5.0, w: 5.35, h: 1.4, rectRadius: 0.09, fill: { color: "EAF2FB" }, line: { color: C.blue, width: 1.25 } });
  s.addText([
    { text: "9.1× nhanh hơn · 16× nhẹ hơn", options: { bold: true, fontSize: 15, color: C.blueDark, breakLine: true } },
    { text: "cùng ~80 matches tốt — đo trực tiếp trên máy này, cùng cặp ảnh mẫu", options: { fontSize: 12.5, color: C.gray } },
  ], { x: 7.66, y: 5.18, w: 4.9, h: 1.05, fontFace: F, margin: 0 });
  footer(s);
})();

// ================================================================ 21 · APPLICATIONS
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "ỨNG DỤNG", "Feature matching chạy đâu trong đời thực?", C.green);
  const apps = [
    ["PANO", "Panorama / image stitching", "Ghép nhiều ảnh chụp liaison thành một tấm rộng — phone camera làm việc này mỗi lần bạn chụp panorama.", C.blue],
    ["SLAM", "SLAM & robot tự hành", "Định vị + dựng bản đồ real-time. ORB-SLAM là nền tảng của nhiều robot, drone, xe tự lái.", C.orange],
    ["AR", "Thực tế tăng cường", "Gắn vật thể 3D lên bề mặt thật: tìm keypoints của marker / cảnh, tính ma trận chuyển đổi, đặt vật thể lên.", C.green],
    ["3D", "3D reconstruction (SfM)", "Từ nhiều ảnh chụp cùng vật thể ở góc khác nhau, khôi phục hình học 3D nhờ các cặp điểm tương ứng.", C.blue],
    ["TAG", "Object recognition & retrieval", "Bộ keypoints + descriptors làm « chữ ký » vật thể / ảnh để tìm trong kho dữ liệu lớn.", C.orange],
    ["TRK", "Tracking vật thể trong video", "Theo dõi vật thể qua từng frame — thể thao, an ninh, phân tích chuyển động.", C.green],
  ];
  apps.forEach((a, i) => {
    const x = 0.5 + (i % 2) * 6.42, y = 1.55 + Math.floor(i / 2) * 1.78;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.92, h: 0.92, rectRadius: 0.12, fill: { color: a[3] }, shadow: shadow() });
    s.addText(a[0], { x, y, w: 0.92, h: 0.92, fontFace: F, fontSize: 14, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s.addText(a[1], { x: x + 1.18, y: y - 0.04, w: 5.1, h: 0.42, fontFace: F, fontSize: 16.5, bold: true, color: C.text, margin: 0 });
    s.addText(a[2], { x: x + 1.18, y: y + 0.4, w: 5.15, h: 1.15, fontFace: F, fontSize: 12.5, color: C.gray, margin: 0 });
  });
  footer(s);
})();

// ================================================================ 22 · SUMMARY
(() => {
  const s = p.addSlide();
  s.background = { color: C.white };
  header(s, "TÓM TẮT", "SIFT & ORB — hai con đường, một mục tiêu", C.navy);
  const card = (x, title, color, fill, items) => {
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 1.55, w: 6.05, h: 3.7, rectRadius: 0.1, fill: { color: fill }, line: { color, width: 1.5 }, shadow: shadow() });
    s.addText(title, { x: x + 0.35, y: 1.8, w: 5.4, h: 0.5, fontFace: F, fontSize: 20, bold: true, color, margin: 0 });
    s.addText(items.map(t => ({ text: t, options: { bullet: bu(), breakLine: true } })),
      { x: x + 0.35, y: 2.42, w: 5.45, h: 2.7, fontFace: F, fontSize: 13.5, color: C.text, paraSpaceAfter: 8, margin: 0, valign: "top" });
  };
  card(0.5, "SIFT — chính xác", C.blueDark, "EAF2FB", [
    "DoG scale-space → keypoint có (x, y, σ, θ)",
    "Descriptor 128-D float, bất biến xoay / scale / sáng",
    "Chuẩn mực so sánh trong nghiên cứu nhiều năm",
    "Chậm hơn — hợp ảnh khó, offline, cần độ chính xác cao",
  ]);
  card(6.78, "ORB — nhanh", C.orangeDark, "FDF0E3", [
    "FAST + pyramid + Harris → keypoint nhanh, có scale",
    "θ bằng intensity centroid; rBRIEF 256-bit steered",
    "Hamming matching cực nhanh, descriptor nhẹ 16×",
    "Chọn khi cần real-time: SLAM, drone, AR, mobile",
  ]);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 5.55, w: 12.33, h: 1.1, rectRadius: 0.09, fill: { color: C.navy } });
  s.addText([
    { text: "Quy tắc chọn nhanh:  ", options: { bold: true, color: C.white } },
    { text: "ảnh biến đổi mạnh & cần chính xác tối đa → SIFT · cần tốc độ / thiết bị yếu / real-time → ORB. Trong OpenCV: ", options: { color: C.light } },
    { text: "cv2.SIFT_create()", options: { bold: true, color: "7EB8F0" } },
    { text: "  ·  ", options: { color: C.light } },
    { text: "cv2.ORB_create()", options: { bold: true, color: "F5B26B" } },
  ], { x: 0.85, y: 5.55, w: 11.7, h: 1.1, fontFace: F, fontSize: 14, valign: "middle", margin: 0 });
  footer(s);
})();

// ================================================================ 23 · CLOSING / REFERENCES
(() => {
  const s = p.addSlide();
  s.background = { color: C.navy };
  s.addText("CẢM ƠN ĐÃ THEO DÕI", { x: 0.9, y: 1.0, w: 11.5, h: 0.45, fontFace: F, fontSize: 15, bold: true, color: C.lightMut, charSpacing: 3, margin: 0 });
  s.addText([
    { text: "SIFT", options: { color: C.blue } },
    { text: "  &  ", options: { color: C.white } },
    { text: "ORB", options: { color: C.orange } },
    { text: " — chạm tới « đôi mắt » của máy tính", options: { color: C.white } },
  ], { x: 0.85, y: 1.4, w: 11.8, h: 0.9, fontFace: F, fontSize: 36, bold: true, margin: 0 });
  s.addShape(p.shapes.LINE, { x: 0.9, y: 2.62, w: 5.5, h: 0, line: { color: C.panelDark, width: 1.5 } });
  s.addText("TÀI LIỆU THAM KHẢO", { x: 0.9, y: 2.85, w: 6, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.lightMut, charSpacing: 2, margin: 0 });
  const refs = [
    "D. G. Lowe (2004). Distinctive Image Features from Scale-Invariant Keypoints. IJCV 60(2), 91–110.",
    "E. Rublee, V. Rabaud, K. Konolige, G. Bradski (2011). ORB: An Efficient Alternative to SIFT or SURF. ICCV 2011.",
    "E. Rosten, T. Drummond (2006). Machine Learning for High-Speed Corner Detection. ECCV 2006.",
    "M. Calonder, V. Lepetit, et al. (2010). BRIEF: Binary Robust Independent Elementary Features. ECCV 2010.",
  ];
  s.addText(refs.map(t => ({ text: t, options: { bullet: bu(), breakLine: true } })),
    { x: 0.9, y: 3.3, w: 7.3, h: 2.4, fontFace: F, fontSize: 13, color: C.light, paraSpaceAfter: 10, margin: 0, valign: "top" });
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 8.6, y: 3.3, w: 4.2, h: 2.5, rectRadius: 0.1, fill: { color: C.panelDark }, line: { color: "2A4E77", width: 1 } });
  s.addText([
    { text: "Dữ liệu & hình ảnh", options: { bold: true, fontSize: 14.5, color: C.white, breakLine: true } },
    { text: "Mọi hình minh họa được chạy thật bằng OpenCV 5.0 (cv2.SIFT_create / ORB_create / FastFeatureDetector) trên ảnh nền Ubuntu; script sinh ảnh kèm theo dự án để tái tạo.", options: { fontSize: 12, color: C.lightMut } },
  ], { x: 8.85, y: 3.5, w: 3.7, h: 2.1, fontFace: F, margin: 0 });
  s.addText("SIFT & ORB — Computer Vision", { x: 0.9, y: 6.7, w: 6, h: 0.35, fontFace: F, fontSize: 12, color: C.grayLight, margin: 0 });
  footer(s);
})();

p.writeFile({ fileName: "SIFT_ORB_Computer_Vision.pptx" }).then(() => console.log("OK — slides:", pageNo));
