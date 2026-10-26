/* Image processing thuần JS — dùng chung cho các widget.
   Mọi mảng ảnh là Float32Array 0..255 (grayscale), kèm (w, h). */
"use strict";

const IMG = (() => {
  function gaussKernel(sigma) {
    const r = Math.max(1, Math.ceil(3 * sigma));
    const k = new Float64Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return { k, r };
  }

  // Blur separable — O(n · 2r) — số trung gian float64 để khớp pipeline Python/OpenCV
  function gaussBlur(src, w, h, sigma) {
    const { k, r } = gaussKernel(sigma);
    const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          a += src[row + xx] * k[i + r];
        }
        tmp[row + x] = a;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let a = 0;
        for (let i = -r; i <= r; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          a += tmp[yy * w + x] * k[i + r];
        }
        out[y * w + x] = a;
      }
    }
    return out;
  }

  function downsampleHalf(src, w, h) {
    const w2 = w >> 1, h2 = h >> 1, out = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++)
      for (let x = 0; x < w2; x++)
        out[y * w2 + x] = 0.25 * (src[2 * y * w + 2 * x] + src[2 * y * w + 2 * x + 1] + src[(2 * y + 1) * w + 2 * x] + src[(2 * y + 1) * w + 2 * x + 1]);
    return { data: out, w: w2, h: h2 };
  }

  function gradAt(src, w, h, x, y) {
    const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
    const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
    return {
      gx: src[y * w + xp] - src[y * w + xm],
      gy: src[yp * w + x] - src[ym * w + x],
    };
  }

  // ----- SIFT scale-space: 4 octave × (S+3)=6 mức mờ, k = 2^(1/S)
  function buildSiftPyramid(gray0, w0, h0, opts) {
    const S = 3, NLEV = S + 3, OCTS = 4, sigma0 = 1.6, k = Math.pow(2, 1 / S);
    const octaves = [], dogs = [];
    let cur = gray0, cw = w0, ch = h0;
    for (let o = 0; o < OCTS; o++) {
      const levels = [cur];
      let prev = cur, prevS = sigma0;
      for (let s = 1; s < NLEV; s++) {
        const sig = sigma0 * Math.pow(k, s);
        const inc = Math.sqrt(Math.max(0.01, sig * sig - prevS * prevS));
        prev = gaussBlur(prev, cw, ch, inc);
        levels.push(prev);
        prevS = sig;
      }
      octaves.push({ levels, w: cw, h: ch, sigmas: levels.map((_, s) => sigma0 * Math.pow(k, s)) });
      const d = [];
      for (let s = 0; s < NLEV - 1; s++) {
        const a = levels[s], b = levels[s + 1], dd = new Float32Array(cw * ch);
        for (let i = 0; i < dd.length; i++) dd[i] = b[i] - a[i];
        d.push(dd);
      }
      dogs.push({ levels: d, w: cw, h: ch });
      if (o < OCTS - 1) {
        const ds = downsampleHalf(levels[S], cw, ch); // lấy ảnh ở 2σ rồi hạ ½ (như paper)
        cur = ds.data; cw = ds.w; ch = ds.h;
      }
    }
    return { octaves, dogs, S, NLEV, OCTS, sigma0, k };
  }

  // ----- DoG extrema: 26-láng giềng, trả list {x,y,oct,s,val}
  function dogExtrema(pyramid, thresh) {
    const out = [];
    for (let o = 0; o < pyramid.OCTS; o++) {
      const dg = pyramid.dogs[o], w = dg.w, h = dg.h;
      for (let s = 1; s <= dg.levels.length - 2; s++) {
        const d = dg.levels[s], below = dg.levels[s - 1], above = dg.levels[s + 1];
        for (let y = 3; y < h - 3; y++) {
          for (let x = 3; x < w - 3; x++) {
            const v = d[y * w + x];
            if (Math.abs(v) < thresh) continue;
            let isMax = true, isMin = true;
            for (let dy = -1; dy <= 1 && (isMax || isMin); dy++)
              for (let dx = -1; dx <= 1 && (isMax || isMin); dx++) {
                if (dx === 0 && dy === 0) continue;
                const nb = d[(y + dy) * w + x + dx];
                if (nb >= v) isMax = false;
                if (nb <= v) isMin = false;
                const nbB = below[(y + dy) * w + x + dx], nbA = above[(y + dy) * w + x + dx];
                if (nbB >= v) isMax = false;
                if (nbB <= v) isMin = false;
                if (nbA >= v) isMax = false;
                if (nbA <= v) isMin = false;
              }
            if (isMax || isMin) out.push({ x, y, oct: o, s, val: v });
          }
        }
      }
    }
    return out;
  }

  // ----- FAST-9: vòng 16 pixel bán kính 3
  const FAST_RING = [[0,-3],[1,-3],[2,-2],[3,-1],[3,0],[3,1],[2,2],[1,3],[0,3],[-1,3],[-2,2],[-3,1],[-3,0],[-3,-1],[-2,-2],[-1,-3]];
  function fastDetect(src, w, h, t) {
    const pts = [];
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const p = src[y * w + x];
        // quick test trên 4 điểm la bàn
        let bright = 0, dark = 0;
        for (const i of [1, 5, 9, 13]) {
          const v = src[(y + FAST_RING[i][1]) * w + (x + FAST_RING[i][0])];
          if (v > p + t) bright++; else if (v < p - t) dark++;
        }
        if (bright < 3 && dark < 3) continue;
        // full vòng 16
        let state = 0, run = 0, ok = false;
        for (let pass = 0; pass < 2 && !ok; pass++) {
          for (let i = 0; i < 16; i++) {
            const v = src[(y + FAST_RING[i][1]) * w + (x + FAST_RING[i][0])];
            const st = v > p + t ? 1 : (v < p - t ? -1 : 0);
            if (st !== 0 && st === state) { run++; if (run >= 9) { ok = true; break; } }
            else { state = st; run = 1; }
          }
        }
        if (ok) pts.push({ x, y });
      }
    }
    return pts;
  }

  // ----- Harris response tại 1 điểm: cửa sổ blockSize×blockSize, R = det − κ·trace²
  function harrisAt(src, w, h, x, y, blockSize, kappa) {
    const r = blockSize >> 1;
    let Sxx = 0, Syy = 0, Sxy = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.min(w - 2, Math.max(1, x + dx)), py = Math.min(h - 2, Math.max(1, y + dy));
        const g = gradAt(src, w, h, px, py);
        Sxx += g.gx * g.gx; Syy += g.gy * g.gy; Sxy += g.gx * g.gy;
      }
    }
    const det = Sxx * Syy - Sxy * Sxy, trace = Sxx + Syy;
    return det - kappa * trace * trace;
  }

  // ----- Harris đầy đủ cho tensor viewer: gradient từng pixel + M + eigenvalues + R
  function harrisParts(src, w, h, x, y, blockSize, kappa) {
    const r = blockSize >> 1;
    const cells = []; // {gx, gy} theo hàng, cửa sổ blockSize×blockSize quanh (x, y)
    let Sxx = 0, Syy = 0, Sxy = 0;
    for (let dy = -r; dy <= r; dy++) {
      const row = [];
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.min(w - 2, Math.max(1, x + dx)), py = Math.min(h - 2, Math.max(1, y + dy));
        const g = gradAt(src, w, h, px, py);
        row.push(g);
        Sxx += g.gx * g.gx; Syy += g.gy * g.gy; Sxy += g.gx * g.gy;
      }
      cells.push(row);
    }
    const M = [[Sxx, Sxy], [Sxy, Syy]];
    const det = Sxx * Syy - Sxy * Sxy, trace = Sxx + Syy;
    const disc = Math.max(0, trace * trace / 4 - det);
    const l1 = trace / 2 + Math.sqrt(disc), l2 = trace / 2 - Math.sqrt(disc);
    let theta = 0;
    if (Math.abs(Sxy) > 1e-9) theta = Math.atan2(l1 - Syy, Sxy);
    else theta = Sxx >= Syy ? 0 : Math.PI / 2;
    return { cells, M, det, trace, lam1: l1, lam2: l2, R: det - kappa * trace * trace, axisTheta: theta };
  }

  // ----- Tích chập phân tách được: áp kx theo trục x rồi ky theo trục y
  // (kernel đối xứng nên tương đương convolution; gương ở biên)
  function convSep(src, w, h, kx, ky) {
    const rx = (kx.length - 1) >> 1, ry = (ky.length - 1) >> 1;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -rx; i <= rx; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i));
          a += src[row + xx] * kx[i + rx];
        }
        tmp[row + x] = a;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let a = 0;
        for (let i = -ry; i <= ry; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          a += tmp[yy * w + x] * ky[i + ry];
        }
        out[y * w + x] = a;
      }
    }
    return out;
  }

  // ----- LoG = ∂²G/∂x² + ∂²G/∂y², tính bằng 2 tích chập phân tách:
  // g''(x)·g(y)  +  g(x)·g''(y)   — nhanh như Gaussian blur.
  function logOfGauss(src, w, h, sigma) {
    const r = Math.max(2, Math.ceil(3 * sigma));
    const g = new Float32Array(2 * r + 1), g2 = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); g[i + r] = v; s += v; }
    for (let i = 0; i < g.length; i++) g[i] /= s;                          // gaussian chuẩn hoá
    for (let i = -r; i <= r; i++) g2[i + r] = ((i * i) / (sigma * sigma * sigma * sigma) - 1 / (sigma * sigma)) * g[i + r];
    const A = convSep(src, w, h, g2, g);   // ∂²/∂x²
    const B = convSep(src, w, h, g, g2);   // ∂²/∂y²
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = A[i] + B[i];
    return out;
  }

  // ----- ảnh màu mẫu (RGBA) — cho widget Bước 0 (grayscale)
  function loadSampleColor(maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h });
      };
      img.onerror = reject;
      img.src = SAMPLE_B64;
    });
  }

  // ----- helpers vẽ
  function putGray(canvas, data, w, h) {
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const im = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(0, Math.min(255, data[i]));
      im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = v;
      im.data[4 * i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return ctx;
  }

  function putDog(canvas, dog, w, h, gain) {
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const im = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(-127, Math.min(127, dog[i] * gain));
      const g = 128;
      let R = g, G = g, B = g;
      if (v > 0) { R = 255; G = B = Math.max(0, g - v * 1.4); }      // sáng hơn → đỏ
      else if (v < 0) { B = 255; R = G = Math.max(0, g + v * 1.4); } // tối hơn → xanh
      im.data[4 * i] = R; im.data[4 * i + 1] = G; im.data[4 * i + 2] = B; im.data[4 * i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return ctx;
  }

  function drawCircle(ctx, x, y, rad, color, width, dash) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function loadSampleGray(maxW) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++)
          gray[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
        resolve({ gray, w, h });
      };
      img.onerror = reject;
      img.src = SAMPLE_B64;
    });
  }

  // singleton sample (640px) dùng chung mọi widget
  let _sample = null;
  function sample() {
    if (!_sample) _sample = loadSampleGray(640);
    return _sample;
  }

  return { gaussBlur, downsampleHalf, gradAt, buildSiftPyramid, dogExtrema, fastDetect, harrisAt, harrisParts, putGray, putDog, drawCircle, sample, loadSampleColor, logOfGauss, convSep, FAST_RING };
})();
