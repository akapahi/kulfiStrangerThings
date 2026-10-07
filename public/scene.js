// Procedural Upside Down: a burning gate under a red storm, framed by rotting
// walls, vines and roots. Drawn once per resize onto two canvases, so lightning
// can flash between the sky (back) and the silhouettes in front of it (front).
//
// `layout` says where the page's title and question form sit (viewport px), so the
// gate burns in the gap between them whatever the window size.

const TAU = Math.PI * 2;

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth fractal noise, 0..1. Used for clouds and for ragged organic edges.
function makeNoise(rand) {
  const grid = new Float32Array(256 * 256);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, y) => grid[((y & 255) << 8) | (x & 255)];
  const value = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += value(x, y) * amp;
      norm += amp;
      x *= 2.03;
      y *= 2.03;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

export function drawScene(backCanvas, frontCanvas, layout = {}) {
  const W = innerWidth;
  const H = innerHeight;
  const {
    titleTop = H * 0.15,
    titleBottom = H * 0.31,
    titleLeft = W * 0.17,
    titleRight = W * 0.83,
    askTop = H * 0.71,
    askBottom = H * 0.86,
  } = layout;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const rand = seeded(1983);
  const between = (a, b) => a + rand() * (b - a);
  const fbm = makeNoise(rand);
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  const scale = Math.max(0.55, Math.min(W, H) / 900);
  const titleMid = (titleTop + titleBottom) / 2;
  const horizon = Math.max(H * 0.45, Math.min(H * 0.72, askTop - H * 0.09));
  const gateTop = Math.min(titleBottom + H * 0.025, horizon - H * 0.12);
  const gate = { x: W / 2, y: (gateTop + horizon) / 2 };
  const narrow = W / H < 0.9;
  const anchors = [];

  const prepare = (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  };

  // Draw onto a scratch layer, then composite it. Lets overlapping strokes share one opacity.
  const layer = (ctx, alpha, blur, draw) => {
    const scratch = document.createElement('canvas');
    scratch.width = W * dpr;
    scratch.height = H * dpr;
    const sctx = scratch.getContext('2d');
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    draw(sctx);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur) ctx.filter = `blur(${blur * dpr}px)`;
    ctx.drawImage(scratch, 0, 0, W, H);
    ctx.restore();
  };

  // ─── Sky and ground: storm clouds above, wet rock below, both lit by the gate ───
  function backdrop(ctx) {
    const sw = 480;
    const sh = Math.max(160, Math.min(720, Math.round((sw * H) / W)));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d');
    const image = sctx.createImageData(sw, sh);
    const d = image.data;
    for (let j = 0; j < sh; j++) {
      const py = (j / sh) * H;
      for (let i = 0; i < sw; i++) {
        const px = (i / sw) * W;
        const k = (j * sw + i) * 4;
        d[k + 3] = 255;
        if (py < horizon) {
          const nx = px / (H * 0.42);
          const ny = py / (H * 0.2);
          const warp = fbm(nx + 3.1, ny + 7.4, 3);
          const cloud = smooth(0.3, 0.74, fbm(nx + warp * 1.7, ny + warp * 0.9, 4));
          const dx = (px - gate.x) / (H * 0.62);
          const dy = (py - gate.y) / (H * 0.3);
          const lit = Math.exp(-(dx * dx + dy * dy) * 1.8);
          const shade = 0.35 + 0.65 * smooth(0.05, 0.6, py / H);
          d[k] = 6 + 44 * cloud * shade + lit * (110 + 140 * cloud);
          d[k + 1] = 1 + 4 * cloud + lit * lit * (26 + 110 * cloud);
          d[k + 2] = 4 + 12 * cloud * (1 - lit) + lit * lit * (16 + 60 * cloud);
        } else {
          // Perspective: features shrink toward the horizon.
          const depth = (py - horizon) / (H - horizon);
          const z = 1 / (depth + 0.06);
          const gx = ((px - gate.x) / H) * z * 2.2;
          const gy = z * 1.4;
          const rock = smooth(0.35, 0.7, fbm(gx, gy, 4));
          const cdx = (px - gate.x) / (H * (0.04 + depth * 0.3));
          const wet = Math.exp(-cdx * cdx) * (1 - depth * 0.8) * (0.35 + 0.65 * fbm(gx * 3, gy * 7, 2));
          const gdx = (px - gate.x) / (H * 0.7);
          const glow = Math.exp(-gdx * gdx) * Math.exp(-depth * 2.6);
          d[k] = 4 + 20 * rock * (1 - depth * 0.5) + glow * (80 + 60 * rock) + wet * 180;
          d[k + 1] = 1 + 2 * rock + glow * glow * 26 + wet * 50;
          d[k + 2] = 2 + 4 * rock + glow * glow * 16 + wet * 28;
        }
      }
    }
    sctx.putImageData(image, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, W, H);
  }

  // ─── The shadow in the storm ─────────────────────────────────
  // Painted on the front canvas, so lightning in the clouds behind throws it into silhouette.
  function shadowMonster(ctx) {
    const s = Math.min(W * 0.62, H * 0.95);
    const bx = gate.x;
    const by = titleMid - H * 0.04;
    const limb = (c, p0, p1, p2, w0, w1) => {
      let prev = p0;
      for (let i = 1; i <= 26; i++) {
        const t = i / 26;
        const mt = 1 - t;
        const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
        const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
        c.lineWidth = w0 + (w1 - w0) * t;
        c.beginPath();
        c.moveTo(prev.x, prev.y);
        c.lineTo(x, y);
        c.stroke();
        prev = { x, y };
      }
    };
    layer(ctx, 0.55, 2.5 * scale, (c) => {
      c.strokeStyle = '#070103';
      c.fillStyle = '#070103';
      c.beginPath();
      c.ellipse(bx, by, s * 0.028, s * 0.07, 0, 0, TAU);
      c.fill();
      c.beginPath(); // long head, bowed toward the ground
      c.moveTo(bx - s * 0.024, by + s * 0.04);
      c.quadraticCurveTo(bx, by + s * 0.1, bx, by + s * 0.15);
      c.quadraticCurveTo(bx, by + s * 0.1, bx + s * 0.024, by + s * 0.04);
      c.fill();
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const hip = { x: bx + side * s * 0.015, y: by - s * 0.03 + k * s * 0.012 };
          const knee = { x: bx + side * s * (0.09 + 0.085 * k), y: by - s * (0.16 - 0.03 * k) };
          const foot = { x: bx + side * s * (0.17 + 0.25 * k), y: horizon + 8 };
          limb(c, hip, { x: (hip.x + knee.x) / 2, y: knee.y - s * 0.03 }, knee, s * 0.018, s * 0.011);
          limb(c, knee, { x: knee.x + side * s * 0.07, y: knee.y + (foot.y - knee.y) * 0.35 }, foot, s * 0.011, s * 0.0025);
        }
      }
    });
  }

  // ─── Ground ──────────────────────────────────────────────────
  // A broken ridge of ruins along the horizon, lower near the gate.
  function ridge(ctx) {
    ctx.beginPath();
    ctx.moveTo(-10, horizon + 6);
    for (let x = -10; x <= W + 10; x += Math.max(2, 3 * scale)) {
      const away = smooth(0.05, 0.4, Math.abs(x - gate.x) / W);
      const spire = rand() < 0.05 ? between(0.01, 0.05) * H * away : 0;
      ctx.lineTo(x, horizon + 4 - (fbm(x / (H * 0.12), 2.2, 3) * H * 0.07 + spire) * (0.15 + 0.85 * away));
    }
    ctx.lineTo(W + 10, horizon + 6);
    ctx.closePath();
    ctx.fillStyle = '#2b0608';
    ctx.fill();
  }

  function wetFloor(ctx) {
    // Broken reflections of the gate in the wet ground.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const t = Math.pow(rand(), 1.6);
      const y = horizon + 4 + (H - horizon) * t;
      const x = gate.x + (rand() + rand() - 1) * (30 + t * 280) * scale;
      const w = between(10, 70) * scale * (0.4 + t);
      const h = between(0.6, 2.2) * scale * (0.5 + t);
      ctx.fillStyle = `rgba(255, ${Math.round(between(50, 120))}, ${Math.round(between(30, 70))}, ${between(0.05, 0.3) * (1 - t * 0.7)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Rocks and rubble, rim-lit on top.
    for (let i = 0; i < 34; i++) {
      const t = between(0.06, 1);
      const size = (6 + 46 * t) * scale * between(0.6, 1.3);
      const y = horizon + (H - horizon) * t;
      let x = between(0, W);
      const path = (40 + t * 150) * scale;
      if (Math.abs(x - gate.x) < path) x = gate.x + Math.sign(x - gate.x || 1) * (path + between(0, 80) * scale);
      const pts = [];
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const r = between(0.65, 1.1);
        pts.push([x + Math.cos(a) * size * r, y + Math.sin(a) * size * 0.42 * r]);
      }
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = '#040102';
      ctx.fill();
      ctx.beginPath(); // upper edge only
      for (let k = 4; k <= n; k++) {
        const [px, py] = pts[k % n];
        k === 4 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.lineWidth = Math.max(0.8, 1.4 * scale);
      ctx.strokeStyle = `rgba(190, 28, 22, ${0.55 * (1 - t * 0.5)})`;
      ctx.stroke();
    }
  }

  // ─── The gate: a burning tear in the world ───────────────────
  function rift(ctx) {
    const top = gateTop;
    const bottom = horizon + H * 0.02;
    const half = Math.min((bottom - top) * 0.17, W * 0.075);
    const N = 110;
    const left = [];
    const right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = top + (bottom - top) * t;
      const profile = Math.pow(Math.sin(Math.PI * t), 0.8) * (0.6 + 0.55 * t);
      const mid = gate.x + (fbm(t * 2.6, 9.9, 2) - 0.5) * half * 0.7;
      const jag = (seed) => 1 + (fbm(t * 7 + seed, 3.3, 2) - 0.5) * 0.9 + (fbm(t * 40 + seed, 8.1, 2) - 0.5) * 0.7;
      left.push({ x: mid - half * profile * jag(0), y });
      right.push({ x: mid + half * profile * jag(50), y });
    }
    const outline = (c) => {
      c.beginPath();
      left.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      for (let i = N; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
      c.closePath();
    };
    const edge = (pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    };
    const cy = (top + bottom) / 2;
    const tall = bottom - top;

    // Glow thrown onto the clouds, and rays through the haze.
    ctx.globalCompositeOperation = 'lighter';
    for (const [r, colour] of [[H * 0.5, 'rgba(255, 45, 28, 0.2)'], [H * 0.22, 'rgba(255, 110, 65, 0.4)']]) {
      const halo = ctx.createRadialGradient(gate.x, cy, 0, gate.x, cy, r);
      halo.addColorStop(0, colour);
      halo.addColorStop(1, 'rgba(120, 10, 5, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(gate.x - r, cy - r, r * 2, r * 2);
    }
    for (let i = 0; i < 18; i++) {
      const a = between(0, TAU);
      const spread = between(0.015, 0.06);
      const reach = H * between(0.3, 0.75);
      const ray = ctx.createRadialGradient(gate.x, cy, tall * 0.2, gate.x, cy, reach);
      ray.addColorStop(0, `rgba(255, 90, 55, ${between(0.05, 0.12)})`);
      ray.addColorStop(1, 'rgba(255, 60, 30, 0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(gate.x, cy);
      ctx.lineTo(gate.x + Math.cos(a - spread) * reach, cy + Math.sin(a - spread) * reach);
      ctx.lineTo(gate.x + Math.cos(a + spread) * reach, cy + Math.sin(a + spread) * reach);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Scorched air around the tear.
    layer(ctx, 0.75, 5 * scale, (c) => {
      outline(c);
      c.lineWidth = 16 * scale;
      c.strokeStyle = '#0c0203';
      c.stroke();
    });

    // The other side: a white-hot sky over a dead skyline.
    outline(ctx);
    const inside = ctx.createRadialGradient(gate.x, cy - tall * 0.1, 0, gate.x, cy, tall * 0.55);
    inside.addColorStop(0, '#fff1e4');
    inside.addColorStop(0.25, '#ffb08a');
    inside.addColorStop(0.7, '#e2332b');
    inside.addColorStop(1, '#7a0c10');
    ctx.fillStyle = inside;
    ctx.fill();
    ctx.save();
    outline(ctx);
    ctx.clip();
    const skylineY = top + tall * 0.76;
    ctx.beginPath();
    ctx.moveTo(gate.x - half * 2, bottom + 4);
    for (let x = gate.x - half * 2; x <= gate.x + half * 2; x += Math.max(1.5, 2 * scale)) {
      const spire = rand() < 0.12 ? between(6, 30) * scale : 0;
      ctx.lineTo(x, skylineY - spire - fbm(x * 0.05, 4.4, 2) * 14 * scale);
    }
    ctx.lineTo(gate.x + half * 2, bottom + 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 3, 6, 0.9)';
    ctx.fill();
    ctx.restore();

    // Burning edges: a wide soft ember glow with a thin hot core.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'miter';
    for (const pts of [left, right]) {
      edge(pts);
      ctx.shadowColor = 'rgba(255, 60, 15, 1)';
      ctx.shadowBlur = 30 * scale * dpr;
      ctx.lineWidth = 4.5 * scale;
      ctx.strokeStyle = 'rgba(255, 80, 30, 0.55)';
      ctx.stroke();
      edge(pts);
      ctx.shadowBlur = 10 * scale * dpr;
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = 'rgba(255, 150, 60, 0.85)';
      ctx.stroke();
      edge(pts);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0.8 * scale;
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.9)';
      ctx.stroke();
    }
    ctx.shadowColor = 'transparent';
    ctx.lineJoin = 'round';

    // Sparks torn off the edges.
    for (let i = 0; i < 120; i++) {
      const p = (rand() < 0.5 ? left : right)[Math.floor(rand() * (N + 1))];
      const far = Math.pow(rand(), 2);
      ctx.fillStyle = `rgba(255, ${Math.round(between(110, 220))}, ${Math.round(between(40, 110))}, ${between(0.4, 0.95) * (1 - far * 0.6)})`;
      ctx.beginPath();
      ctx.arc(p.x + between(-1, 1) * (8 + far * 60) * scale, p.y + between(-1, 1) * (8 + far * 50) * scale, between(0.4, 1.6) * scale, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Dim the sky behind the title so the red lettering holds against the glow.
  function titleShade(ctx) {
    const rx = (titleRight - titleLeft) * 0.66;
    const ry = (titleBottom - titleTop) * 1.05;
    ctx.save();
    ctx.translate((titleLeft + titleRight) / 2, titleMid);
    ctx.scale(rx / ry, 1);
    const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    shade.addColorStop(0, 'rgba(4, 0, 1, 0.62)');
    shade.addColorStop(0.6, 'rgba(4, 0, 1, 0.45)');
    shade.addColorStop(1, 'rgba(4, 0, 1, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(-ry, -ry, ry * 2, ry * 2);
    ctx.restore();
  }

  // ─── Dead trees and broken stumps on the horizon ─────────────
  function tree(ctx, x, y, h, colour) {
    ctx.strokeStyle = colour;
    const branch = (bx, by, a, len, w, depth) => {
      const ex = bx + Math.cos(a) * len;
      const ey = by + Math.sin(a) * len;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 + between(-1, 1) * len * 0.14, by + Math.sin(a) * len * 0.5, ex, ey);
      ctx.lineWidth = w;
      ctx.stroke();
      if (depth <= 0 || w < 0.5) return;
      const kids = depth > 3 ? 2 : Math.floor(between(2, 3.5));
      for (let k = 0; k < kids; k++) {
        branch(ex, ey, a + between(-0.75, 0.75), len * between(0.55, 0.8), w * 0.6, depth - 1);
      }
    };
    branch(x, y, -Math.PI / 2 + between(-0.12, 0.12), h * 0.4, Math.max(1.5, h * 0.05), 5);
  }

  // A snapped trunk: splintered top, rim-lit on the side facing the gate.
  function stump(ctx, x, y, h, colour) {
    const w = h * between(0.09, 0.16);
    const lean = between(-0.18, 0.18) * h;
    const pts = [[x - w, y], [x - w * 0.75 + lean * 0.5, y - h * 0.5]];
    const splinters = Math.floor(between(3, 6));
    for (let k = 0; k <= splinters; k++) {
      const u = k / splinters;
      const tip = k % 2 ? between(0.55, 0.75) : between(0.8, 1.1);
      pts.push([x + lean + (u * 2 - 1) * w * 0.6, y - h * tip]);
    }
    pts.push([x + w * 0.75 + lean * 0.5, y - h * 0.5], [x + w, y]);
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    const lit = x < gate.x ? pts.slice(-3) : pts.slice(0, 3);
    ctx.beginPath();
    lit.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.lineWidth = Math.max(0.8, 1.2 * scale);
    ctx.strokeStyle = 'rgba(210, 34, 26, 0.55)';
    ctx.stroke();
  }

  function forest(ctx) {
    const clearOf = (frac) => {
      const x = between(0, W);
      const gap = Math.max(W * frac, H * frac * 0.9);
      return Math.abs(x - gate.x) < gap ? gate.x + Math.sign(x - gate.x || 1) * between(gap, W * 0.5) : x;
    };
    const tall = narrow ? 0.6 : 1;
    // Far row, lost in the haze.
    ctx.filter = `blur(${1.2 * dpr}px)`;
    for (let i = 0; i < 12; i++) tree(ctx, clearOf(0.12), horizon + 3, H * between(0.1, 0.2) * tall, '#3d080b');
    ctx.filter = 'none';

    // Mist along the horizon.
    const mist = ctx.createLinearGradient(0, horizon - H * 0.07, 0, horizon + H * 0.06);
    mist.addColorStop(0, 'rgba(210, 40, 30, 0)');
    mist.addColorStop(0.55, 'rgba(210, 40, 30, 0.26)');
    mist.addColorStop(1, 'rgba(210, 40, 30, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, horizon - H * 0.07, W, H * 0.13);

    // Nearer row.
    for (let i = 0; i < 7; i++) tree(ctx, clearOf(0.24), horizon + H * between(0.02, 0.05), H * between(0.24, 0.4) * tall, '#100305');
    for (let i = 0; i < 7; i++) stump(ctx, clearOf(0.1), horizon + H * between(0.01, 0.06), H * between(0.05, 0.15), '#0c0204');
  }

  // ─── Glowing cracks ──────────────────────────────────────────
  function crack(ctx, x, y, heading, steps, width) {
    const paths = [];
    const walk = (cx, cy, base, n, w) => {
      const pts = [[cx, cy]];
      for (let i = 0; i < n; i++) {
        base += between(-0.2, 0.2);
        const a = base + between(-0.7, 0.7);
        const step = between(8, 22) * scale;
        cx += Math.cos(a) * step;
        cy += Math.sin(a) * step;
        pts.push([cx, cy]);
        if (n - i > 3 && rand() < 0.18) {
          walk(cx, cy, base + (rand() < 0.5 ? -1 : 1) * between(0.6, 1.3), Math.floor((n - i) * 0.6), w * 0.7);
        }
      }
      paths.push({ pts, w });
    };
    walk(x, y, heading, steps, width);

    const stroke = (widthK, style, blur) => {
      ctx.shadowBlur = blur * scale * dpr;
      for (const { pts, w } of paths) {
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.lineWidth = Math.max(0.4, w * widthK * scale);
        ctx.strokeStyle = style;
        ctx.stroke();
      }
    };
    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(255, 25, 15, 1)';
    stroke(3, 'rgba(255, 30, 20, 0.3)', 16);
    stroke(1, 'rgba(255, 60, 40, 0.95)', 8);
    stroke(0.35, 'rgba(255, 190, 150, 0.7)', 0);
    ctx.restore();
  }

  // ─── Tendrils: tapered, wet, rim-lit by the gate ─────────────
  function paintTendril(ctx, pts, dim) {
    const reach = Math.max(W, H) * 0.8;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      let nx = -(q.y - p.y);
      let ny = q.x - p.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      if (nx * (gate.x - p.x) + ny * (gate.y - p.y) < 0) { nx = -nx; ny = -ny; }
      const lit = Math.max(0.22, 1 - Math.hypot(gate.x - p.x, gate.y - p.y) / reach);
      segs.push({ p, q, nx, ny, lit });
    }
    const pass = (widthK, offsetK, style) => {
      for (const s of segs) {
        const w = s.p.w;
        if (w < 0.4) continue;
        ctx.beginPath();
        ctx.moveTo(s.p.x + s.nx * w * offsetK, s.p.y + s.ny * w * offsetK);
        ctx.lineTo(s.q.x + s.nx * w * offsetK, s.q.y + s.ny * w * offsetK);
        ctx.lineWidth = Math.max(0.5, w * widthK);
        ctx.strokeStyle = style(s.lit);
        ctx.stroke();
      }
    };

    if (dim) {
      pass(1, 0, () => '#060102');
      pass(0.22, 0.34, (l) => `rgba(170, 22, 18, ${0.5 * l})`);
      return;
    }
    pass(1.3, -0.1, () => 'rgba(0, 0, 0, 0.5)');
    pass(1, 0, () => '#070203');
    pass(0.72, 0.13, () => '#1b0406');
    pass(0.4, 0.24, (l) => `rgba(92, 10, 12, ${0.85 * l})`);
    pass(0.15, 0.37, (l) => `rgba(215, 36, 30, ${0.75 * l})`);
    pass(0.045, 0.42, (l) => `rgba(255, 170, 150, ${0.5 * l})`);

    if (pts[0].w > 10) {
      // Sinew wrapped around the thicker ones.
      for (let k = 0; k < 3; k++) {
        const phase = between(0, TAU);
        const freq = between(0.15, 0.35);
        ctx.beginPath();
        pts.forEach((p, i) => {
          const off = Math.sin(i * freq + phase) * p.w * 0.45;
          const x = p.x + Math.cos(p.a + Math.PI / 2) * off;
          const y = p.y + Math.sin(p.a + Math.PI / 2) * off;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.lineWidth = between(0.6, 1.3);
        ctx.strokeStyle = `rgba(200, 40, 30, ${between(0.12, 0.3)})`;
        ctx.stroke();
      }
      // Wet glints on the lit side.
      for (const s of segs) {
        if (s.p.w < 8 || rand() > 0.16) continue;
        ctx.fillStyle = `rgba(255, 215, 205, ${between(0.25, 0.7) * s.lit})`;
        ctx.beginPath();
        ctx.ellipse(s.p.x + s.nx * s.p.w * 0.3, s.p.y + s.ny * s.p.w * 0.3, s.p.w * between(0.08, 0.2), s.p.w * 0.05, s.p.a, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Floor roots may climb at the sides, but stay under the input across the middle.
  const rootFloor = Math.min(H * 0.97, Math.max(H * 0.9, askBottom + H * 0.03));
  const rootCeiling = (x) => rootFloor - H * 0.2 * smooth(0.16, 0.42, Math.abs(x - W / 2) / W);

  // A wandering root or trunk. `low` keeps it under rootCeiling.
  function grow(ctx, x, y, angle, width, length, depth, dim, low = false) {
    const pts = [];
    let a = angle;
    let bend = between(-0.04, 0.04);
    for (let i = 0; i < length; i++) {
      const w = width * Math.pow(1 - i / length, 0.7);
      pts.push({ x, y, w, a });
      const maxBend = width > 20 ? 0.035 : 0.06;
      bend = Math.max(-maxBend, Math.min(maxBend, bend + between(-0.015, 0.015)));
      a += bend;
      if (low && y < rootCeiling(x)) a += Math.cos(a) > 0 ? 0.13 : -0.13;
      const step = Math.max(3, width * 0.3);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
    }
    paintTendril(ctx, pts, dim);
    if (!dim) pts.filter((_, i) => i % 6 === 0).forEach((p) => anchors.push(p));

    if (depth === 0) {
      const branches = Math.floor(between(1, 2.6));
      for (let b = 0; b < branches; b++) {
        const p = pts[Math.floor(between(0.15, 0.55) * pts.length)];
        const side = rand() < 0.5 ? -1 : 1;
        grow(ctx, p.x, p.y, p.a + side * between(0.25, 0.6), p.w * 0.55, Math.floor(length * 0.7), depth + 1, dim, low);
      }
    }
  }

  // A vine strung from one point to another, thick at the start, thin at the end.
  function vine(ctx, from, to, width, sag) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ctrl = { x: (from.x + to.x) / 2 - (dy / len) * sag, y: (from.y + to.y) / 2 + (dx / len) * sag };
    const n = Math.max(24, Math.round(len / Math.max(4, width * 0.3)));
    const seed = between(0, 100);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const mt = 1 - t;
      const tx = 2 * mt * (ctrl.x - from.x) + 2 * t * (to.x - ctrl.x);
      const ty = 2 * mt * (ctrl.y - from.y) + 2 * t * (to.y - ctrl.y);
      const tl = Math.hypot(tx, ty) || 1;
      const wobble = (fbm(t * 4 + seed, 0.5, 2) - 0.5) * width * 2 * Math.sin(Math.PI * t);
      pts.push({
        x: mt * mt * from.x + 2 * mt * t * ctrl.x + t * t * to.x + (-ty / tl) * wobble,
        y: mt * mt * from.y + 2 * mt * t * ctrl.y + t * t * to.y + (tx / tl) * wobble,
        w: width * Math.pow(1 - t, 0.8) + 1,
        a: Math.atan2(ty, tx),
      });
    }
    paintTendril(ctx, pts, false);
    pts.filter((_, i) => i % 8 === 0).forEach((p) => anchors.push(p));
  }

  // Sticky strings sagging between tendrils.
  function webbing(ctx, count) {
    for (let i = 0; i < count && anchors.length > 1; i++) {
      const a = anchors[Math.floor(rand() * anchors.length)];
      const b = anchors[Math.floor(rand() * anchors.length)];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 40 * scale || d > 300 * scale) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 + d * between(0.15, 0.45);
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + between(-8, 8), my + between(-10, 10), b.x, b.y);
        ctx.lineWidth = between(0.4, 1.2);
        ctx.strokeStyle = s === 0 ? 'rgba(8, 2, 3, 0.85)' : `rgba(190, 30, 24, ${between(0.15, 0.4)})`;
        ctx.stroke();
      }
    }
  }

  // ─── Walls: rotting masses framing both sides ────────────────
  const wallWidth = Math.max(46, Math.min(W * 0.17, 250 * scale));
  const wallEdge = (y, side) => {
    const v = y / H;
    const arch = Math.pow(Math.abs(v - 0.55) / 0.55, 2.2);
    return wallWidth * (0.45 + 0.75 * arch + 0.55 * (fbm(v * 5 + (side > 0 ? 40 : 0), 1.7, 3) - 0.5));
  };

  function wall(ctx, side) {
    const X = (d) => (side < 0 ? d : W - d);
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(X(-20), -20);
      for (let y = -20; y <= H + 20; y += 10) ctx.lineTo(X(wallEdge(y, side)), y);
      ctx.lineTo(X(-20), H + 20);
      ctx.closePath();
    };
    trace();
    const body = ctx.createLinearGradient(X(0), 0, X(wallWidth * 1.4), 0);
    body.addColorStop(0, '#020101');
    body.addColorStop(0.6, '#090203');
    body.addColorStop(1, '#1a0506');
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    trace();
    ctx.clip();
    // Sinew running down the wall.
    for (let i = 0; i < 70; i++) {
      const inset = Math.pow(rand(), 1.5) * wallWidth * 1.2;
      const phase = between(0, TAU);
      const y0 = between(-20, H * 0.8);
      const y1 = y0 + between(H * 0.15, H * 0.6);
      ctx.beginPath();
      for (let y = y0; y <= y1; y += 12) {
        const x = X(wallEdge(y, side) - inset + Math.sin(y * 0.02 + phase) * 5 * scale);
        y === y0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const near = 1 - Math.min(1, inset / wallWidth);
      ctx.lineWidth = between(0.6, 2.4) * scale;
      ctx.strokeStyle = rand() < 0.45 ? `rgba(0, 0, 0, ${between(0.3, 0.7)})` : `rgba(150, 20, 18, ${between(0.05, 0.14) + near * 0.2})`;
      ctx.stroke();
    }
    // Rim light along the inner edge, from the gate.
    for (const [width, colour] of [[16 * scale, 'rgba(150, 18, 16, 0.22)'], [5 * scale, 'rgba(215, 32, 26, 0.4)'], [1.5 * scale, 'rgba(255, 120, 100, 0.55)']]) {
      ctx.beginPath();
      for (let y = -20; y <= H + 20; y += 10) {
        const x = X(wallEdge(y, side));
        y === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
    ctx.restore();

    // Trunks hanging down the wall and climbing up it.
    vine(ctx, { x: X(wallWidth * between(0.3, 0.6)), y: -30 }, { x: X(wallEdge(H * 0.85, side) * 0.5), y: H * between(0.78, 0.95) }, between(34, 52) * scale, side * wallWidth * 0.25);
    vine(ctx, { x: X(wallWidth * between(0.1, 0.4)), y: H + 30 }, { x: X(wallEdge(H * 0.2, side) * 0.6), y: H * between(0.08, 0.28) }, between(40, 60) * scale, -side * wallWidth * 0.2);
    vine(ctx, { x: X(wallEdge(H * 0.05, side) * 0.9), y: -30 }, { x: X(wallEdge(H * 0.5, side) * 0.8), y: H * between(0.45, 0.62) }, between(14, 24) * scale, side * wallWidth * 0.3);

    // Cracks glowing through the rot.
    for (let i = 0; i < 6; i++) {
      const y = H * between(0.12, 0.85);
      crack(ctx, X(wallEdge(y, side) * between(0.25, 0.85)), y, between(0, TAU), Math.floor(between(7, 13)), between(1.2, 2));
    }
  }

  // Punch a soft hole in a layer so text over it stays readable.
  function soften(ctx, cy, rx, ry, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(W / 2, cy);
    ctx.scale(rx / ry, 1);
    const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    hole.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    hole.addColorStop(0.55, `rgba(0, 0, 0, ${alpha * 0.8})`);
    hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hole;
    ctx.fillRect(-ry, -ry, ry * 2, ry * 2);
    ctx.restore();
  }

  // ─── Back: sky, shadow, ground, gate, forest ─────────────────
  const back = prepare(backCanvas);
  backdrop(back);
  ridge(back);
  rift(back);
  forest(back);
  titleShade(back);
  wetFloor(back);
  back.save(); // cracks in the floor, flattened by perspective
  back.translate(0, H);
  back.scale(1, 0.4);
  crack(back, W * 0.27, -H * 0.3, between(-0.5, 0.5), 11, 2);
  crack(back, W * 0.76, -H * 0.42, Math.PI + between(-0.5, 0.5), 10, 1.8);
  back.restore();

  // ─── Front: vines from the gate, walls, roots ────────────────
  const front = prepare(frontCanvas);
  const g = H * 0.01; // gate-relative unit
  vine(front, { x: -30, y: H * 0.02 }, { x: gate.x - 2.5 * g, y: gateTop + 4 * g }, 38 * scale, H * 0.13);
  vine(front, { x: W + 30, y: H * 0.04 }, { x: gate.x + 2.5 * g, y: gateTop + 5 * g }, 40 * scale, -H * 0.13);
  if (!narrow) {
    vine(front, { x: W * 0.2, y: -30 }, { x: gate.x - 1 * g, y: gateTop + 1 * g }, 20 * scale, -H * 0.07);
    vine(front, { x: W * 0.82, y: -30 }, { x: gate.x + 1 * g, y: gateTop + 1 * g }, 22 * scale, H * 0.07);
    vine(front, { x: W * 0.4, y: -30 }, { x: gate.x - 0.5 * g, y: gateTop }, 9 * scale, H * 0.03);
    vine(front, { x: W * 0.63, y: -30 }, { x: gate.x + 0.5 * g, y: gateTop }, 10 * scale, -H * 0.03);
  }
  soften(front, titleMid, Math.min(W * 0.55, 760), Math.max(H * 0.12, (titleBottom - titleTop) * 0.95), 0.7);
  front.globalCompositeOperation = 'destination-over'; // behind the vines
  shadowMonster(front);
  front.globalCompositeOperation = 'source-over';

  wall(front, -1);
  wall(front, 1);

  // Roots across the floor, kept low so they frame the input rather than cover it.
  const roots = Math.max(2, Math.round(W / 420));
  for (let i = 0; i < roots; i++) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? -30 : W + 30;
      const heading = side < 0 ? between(0.05, 0.3) : Math.PI - between(0.05, 0.3);
      grow(front, x, H * between(0.8, 0.98), heading, between(38, 66) * scale, Math.floor(between(45, 70)), 0, false, true);
    }
  }
  for (let i = 0; i < roots + 1; i++) {
    const x = between(0, W);
    const toward = x < W / 2 ? -1 : 1;
    grow(front, x, H + 30, -Math.PI / 2 + toward * between(0.9, 1.3), between(30, 54) * scale, Math.floor(between(28, 44)), 1, false, true);
  }
  for (let i = 0; i < 3; i++) {
    grow(front, between(W * 0.08, W * 0.92), -30, Math.PI / 2 + between(-0.3, 0.3), between(8, 16) * scale, Math.floor(between(20, 34)), 1, false);
  }
  webbing(front, 110);
  soften(front, (askTop + askBottom) / 2, Math.min(W * 0.46, 470), Math.max(H * 0.1, (askBottom - askTop) * 0.8), 0.9);
}
