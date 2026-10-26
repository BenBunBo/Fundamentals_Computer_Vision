/* Chung cho trang Harris & trang Canny: bổ sung thuật ngữ vào tooltip (GLOSS của core.js),
   render số tham chiếu REAL_HC (sinh bởi scripts/generate_hc_assets.py) và kênh phát điểm
   HCPICK để các widget Harris liên kết với nhau (bấm 1 điểm ở widget eigen-plane →
   widget E(u,v) + tensor viewer cùng nhảy tới điểm đó). */
"use strict";

// ---------------------------------------------------------------- thuật ngữ bổ sung
if (typeof GLOSS !== "undefined") {
  Object.assign(GLOSS, {
    "sobel": ["Sobel 3×3", "Kernel đạo hàm 3×3: [−1,0,1; −2,0,2; −1,0,1] theo x = đạo hàm trung tâm ⊗ mượt [1,2,1] vuông góc. Trên ramp tuyến tính cho 8·f′ — mọi ngưỡng phải hiểu theo thang đó.", "https://en.wikipedia.org/wiki/Sobel_operator"],
    "nms": ["Non-Maximum Suppression", "Chỉ giữ pixel là cực đại cục bộ theo hướng gradient (so với 2 láng giềng dọc hướng đó) — cắt dải gradient dày 3–5px về sống lưng mảnh 1px.", "https://en.wikipedia.org/wiki/Non-maximum_suppression"],
    "hysteresis": ["Hysteresis (ngưỡng kép)", "Hai ngưỡng t_high / t_low: pixel ≥ t_high là cạnh chắc chắn; pixel ≥ t_low chỉ được cứu nếu nối được (qua chuỗi pixel yếu) về một pixel mạnh — bao đóng bắc cầu tính bằng BFS.", "https://en.wikipedia.org/wiki/Canny_edge_detector"],
    "lowpass": ["Bộ lọc thông thấp (low-pass)", "Giữ tần số thấp (mảng sáng/tối lớn), cắt tần số cao (nhiễu, chi tiết mảnh). Gaussian là thông thấp chuẩn — và là bộ lọc tối ưu theo tiêu chí của Canny.", "https://en.wikipedia.org/wiki/Low-pass_filter"],
    "snr": ["SNR — Signal-to-Noise Ratio", "Tỉ số tín hiệu/nhiễu: độ cao đáp ứng thật tại cạnh chia độ lệch chuẩn đáp ứng do nhiễu ở vùng phẳng. Tiêu chí số 1 của Canny.", "https://en.wikipedia.org/wiki/Signal-to-noise_ratio"],
    "separable": ["Separable kernel", "Kernel 2D tách được thành 2 kernel 1D nhân Descartes: chập theo x rồi theo y — chi phí O(2k) thay vì O(k²) mỗi pixel. Gaussian và đạo hàm Gaussian đều separable.", "https://en.wikipedia.org/wiki/Separable_filter"],
    "quantize": ["Lượng tử hoá (quantize)", "Nén giá trị liên tục về ít mức rời rạc để xử lý nhanh: góc θ ∈ [0°,180°) nén về 4 sector (0°/45°/90°/135°) để tra láng giềng trên lưới 8-hướng.", null],
  });
}

// ---------------------------------------------------------------- render REAL_HC
// <span data-hcr="harris.lam1" data-fmt="sci"> · <div data-hcr-mat="harris.M" data-fmt="sci">
function hcrFmt(v, f) {
  if (typeof v !== "number") return String(v);
  if (f === "int") return Math.round(v).toLocaleString("vi-VN");
  if (f === "f1") return v.toFixed(1);
  if (f === "f2") return v.toFixed(2);
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function sci(x) {
    if (Math.abs(x) >= 1e6) {
      const e = Math.floor(Math.log10(Math.abs(x)));
      const m = x / Math.pow(10, e);
      return m.toFixed(2) + "·10" + String(e).split("").map(c => SUP[c]).join("");
    }
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("vi-VN");
    return Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1);
  }
  if (f === "sci") return sci(v);
  return sci(v); // mặc định: tự chọn định dạng
}
function hcrPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }

document.addEventListener("DOMContentLoaded", () => {
  if (typeof REAL_HC === "undefined") return;
  document.querySelectorAll("[data-hcr]").forEach(el => {
    const v = hcrPath(REAL_HC, el.dataset.hcr);
    if (v != null) el.textContent = hcrFmt(v, el.dataset.fmt);
  });
  document.querySelectorAll("[data-hcr-mat]").forEach(el => {
    const m = hcrPath(REAL_HC, el.dataset.hcrMat);
    if (!Array.isArray(m)) return;
    el.innerHTML = "<table class='mat'>" +
      m.map(row => "<tr>" + row.map(c => "<td>" + hcrFmt(c, el.dataset.fmt) + "</td>").join("") + "</tr>").join("") +
      "</table>";
  });
});

// ---------------------------------------------------------------- kênh phát điểm dùng chung
window.HCPICK = {
  fns: [],
  on(fn) { this.fns.push(fn); },
  emit(x, y, label) { this.fns.forEach(f => { try { f(x, y, label); } catch (e) { /* widget khác lỗi không được làm hỏng widget này */ } }); },
};
