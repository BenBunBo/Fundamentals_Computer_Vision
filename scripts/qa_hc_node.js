// QA số học: chạy ĐÚNG các hàm JS của trang (hc_harris.js / hc_canny.js / imgproc.js)
// trên ảnh xám do Python xuất, đối chiếu với kết quả Python (bản sao pipeline JS).
const fs = require("fs");
global.window = global;
global.document = { getElementById: () => null, addEventListener: () => {} };

const ROOT = "/home/huy/SIFT&ORB/sift-orb-html/";
const H = require(ROOT + "js/hc_harris.js");
const C = require(ROOT + "js/hc_canny.js");
const IMG = new Function(fs.readFileSync(ROOT + "js/imgproc.js", "utf8") + "; return IMG;")();

const { w, h } = JSON.parse(fs.readFileSync("/tmp/hc_dims.json", "utf8"));
const gray = new Float32Array(fs.readFileSync("/tmp/hc_gray.f32").buffer, 0, w * h);
const py = JSON.parse(fs.readFileSync("/tmp/hc_py.json", "utf8"));

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  — " + detail : ""));
  if (!ok) fails++;
}
function relDiff(a, b) { const m = Math.max(Math.abs(a), Math.abs(b), 1e-12); return Math.abs(a - b) / m; }

// ---------------- Harris ----------------
const maps = H.gradientMaps(gray, w, h);
const sq = a => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * a[i]; return o; };
const prod = () => { const o = new Float64Array(maps.gx.length); for (let i = 0; i < o.length; i++) o[i] = maps.gx[i] * maps.gy[i]; return o; };
const Ixx = H.integral(sq(maps.gx), w, h);
const Iyy = H.integral(sq(maps.gy), w, h);
const Ixy = H.integral(prod(), w, h);
const w1 = w + 1, r = 3, KAPPA = 0.04;
const R = new Float64Array(w * h);
let xMax = 0, yMax = 0, Rmax = -Infinity;
for (let y = 0; y < h; y++) {
  const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
  for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
    const Sxx = H.isum(Ixx, w1, x0, y0, x1, y1);
    const Syy = H.isum(Iyy, w1, x0, y0, x1, y1);
    const Sxy = H.isum(Ixy, w1, x0, y0, x1, y1);
    const Rv = Sxx * Syy - Sxy * Sxy - KAPPA * (Sxx + Syy) * (Sxx + Syy);
    R[y * w + x] = Rv;
    if (Rv > Rmax) { Rmax = Rv; xMax = x; yMax = y; }
  }
}
check("Harris argmax (x,y) khớp Python", xMax === py.harris.x && yMax === py.harris.y,
  `js=(${xMax},${yMax}) py=(${py.harris.x},${py.harris.y})`);
check("Harris Rmax khớp (rel < 1e-9)", relDiff(Rmax, py.harris.Rmax) < 1e-9,
  `js=${Rmax} py=${py.harris.Rmax} rel=${relDiff(Rmax, py.harris.Rmax).toExponential(2)}`);

const P = H.harrisSums(gray, w, h, py.harris.x, py.harris.y, 7, 0.04);
const m0 = Math.max(relDiff(P.M[0][0], py.harris.M[0][0]), relDiff(P.M[0][1], py.harris.M[0][1]),
  relDiff(P.M[1][1], py.harris.M[1][1]));
check("Harris M tại góc demo khớp (rel < 1e-9)", m0 < 1e-9, `max rel=${m0.toExponential(2)}`);
check("Harris R tại góc demo khớp", relDiff(P.R, py.harris.R) < 1e-9,
  `js=${P.R} py=${py.harris.R}`);
check("Harris λ1,λ2 khớp", relDiff(P.lam1, py.harris.lam1) < 1e-9 && relDiff(P.lam2, py.harris.lam2) < 1e-9,
  `js=(${P.lam1},${P.lam2}) py=(${py.harris.lam1},${py.harris.lam2})`);

// ---------------- Canny ----------------
const t0 = Date.now();
const blur = IMG.gaussBlur(gray, w, h, 1.4);
const { gx, gy } = C.sobelMaps(blur, w, h);
const mag = C.magOf(gx, gy, true);
const keep = C.nmsOf(gx, gy, mag, w, h);
const res = C.hystOf(keep, mag, w, h, 55, 110);
console.log("  (node pipeline: " + (Date.now() - t0) + " ms cho 640x" + h + ")");

let magMax = 0;
for (let i = 0; i < mag.length; i++) if (mag[i] > magMax) magMax = mag[i];
check("Canny max|∇I| khớp (rel < 1e-9)", relDiff(magMax, py.canny.magMax) < 1e-9,
  `js=${magMax.toFixed(6)} py=${py.canny.magMax.toFixed(6)}`);
check("Canny NMS keep khớp", res.nStrong + countWeakKeep(res, keep) === py.canny.nKeep || countKeep(keep) === py.canny.nKeep,
  `js keep=${countKeep(keep)} py=${py.canny.nKeep}`);
check("Canny strong khớp", countVal(res.strong) === py.canny.nStrong, `js=${countVal(res.strong)} py=${py.canny.nStrong}`);
check("Canny weak khớp", countVal(res.weak) === py.canny.nWeak, `js=${countVal(res.weak)} py=${py.canny.nWeak}`);
check("Canny edge (hysteresis) khớp", res.nEdge === py.canny.nEdge, `js=${res.nEdge} py=${py.canny.nEdge}`);

// self-check += xác minh trên ảnh tổng hợp có đáp án biết trước
const tw = 24, th2 = 24;
const syn = new Float32Array(tw * th2);
for (let y = 0; y < th2; y++) for (let x = 0; x < tw; x++) syn[y * tw + x] = x < 12 ? 30 : 200; // cạnh dọc
const sb = IMG.gaussBlur(syn, tw, th2, 1.4);
const sg = C.sobelMaps(sb, tw, th2);
const smag = C.magOf(sg.gx, sg.gy, true);
const skeep = C.nmsOf(sg.gx, sg.gy, smag, tw, th2);
const sres = C.hystOf(skeep, smag, tw, th2, 10, 50);
let okRidge = true;
for (let y = 1; y < th2 - 1; y++) {
  // NMS của cạnh dọc phải là 1 cột (11 hoặc 12 tùy hòa) — không có 2 cột kề nhau đều giữ
  let cnt = 0;
  for (let x = 9; x < 15; x++) if (skeep[y * tw + x]) cnt++;
  if (cnt > 1) okRidge = false;
}
check("Canny tự kiểm: cạnh dọc tổng hợp còn sống lưng 1px", okRidge, "");

function countVal(a) { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] ? 1 : 0; return n; }
function countKeep(a) { return countVal(a); }
function countWeakKeep() { return 0; }

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAIL(S)");
process.exit(fails === 0 ? 0 : 1);
