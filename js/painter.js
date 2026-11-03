// Paints a gouache panorama from real elevation tiles: a voxel view of the terrain, then brush strokes.
(() => {
  const ZOOM = 11;
  const TILE = 256;
  const GRID = TILE * 3;
  const EARTH = 40075016;

  // Smooth value noise, so clearings have no visible rhythm.
  const hash = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const ax = x - x0;
    const ay = y - y0;
    const sx = ax * ax * (3 - 2 * ax);
    const sy = ay * ay * (3 - 2 * ay);
    const top = hash(x0, y0) * (1 - sx) + hash(x0 + 1, y0) * sx;
    const bottom = hash(x0, y0 + 1) * (1 - sx) + hash(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };

  const tileCoord = (lat, lon) => {
    const n = 2 ** ZOOM;
    return [
      ((lon + 180) / 360) * n,
      ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
    ];
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  // Fallback relief for when the tiles cannot be loaded.
  function syntheticHeights() {
    const h = new Float32Array(GRID * GRID);
    const wave = (x, y, f, p) => Math.sin(x * f + p) * Math.cos(y * f * 1.3 - p);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let v = 0;
        for (let o = 0; o < 5; o++) v += wave(x, y, 0.012 * 2 ** o, o * 1.7) / 2 ** o;
        h[y * GRID + x] = 2300 + Math.abs(v) * 900;
      }
    }
    return h;
  }

  async function loadHeights(dest) {
    const [cx, cy] = tileCoord(...dest.center).map(Math.floor);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = GRID;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const jobs = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        jobs.push(loadImage(`data/dem/${dest.id}/${cx + dx}_${cy + dy}.png`).then((img) => {
          ctx.drawImage(img, (dx + 1) * TILE, (dy + 1) * TILE);
        }));
      }
    }
    await Promise.all(jobs);
    const { data } = ctx.getImageData(0, 0, GRID, GRID);
    const h = new Float32Array(GRID * GRID);
    for (let i = 0; i < h.length; i++) {
      h[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
    }
    return { h, originX: cx - 1, originY: cy - 1 };
  }

  const ramp = (s, stops) => {
    for (const [limit, color] of stops) if (s > limit) return color;
    return stops[stops.length - 1][1];
  };

  const SNOW = [[0.14, [52, 84, 135]], [0.3, [92, 127, 173]], [0.46, [148, 179, 209]], [0.62, [201, 218, 234]], [0.82, [233, 241, 248]], [1.02, [252, 253, 255]]];
  const snowColor = (s) => {
    if (s <= SNOW[0][0]) return SNOW[0][1];
    for (let i = 1; i < SNOW.length; i++) {
      if (s < SNOW[i][0]) {
        const t = (s - SNOW[i - 1][0]) / (SNOW[i][0] - SNOW[i - 1][0]);
        return SNOW[i][1].map((c, n) => SNOW[i - 1][1][n] + (c - SNOW[i - 1][1][n]) * t);
      }
    }
    return SNOW[SNOW.length - 1][1];
  };
  const PISTE_COLORS = { novice: "#1f5fbf", easy: "#1f5fbf", intermediate: "#c8202f", advanced: "#10192b", expert: "#10192b", freeride: "#10192b" };
  const ROCK = [[0.6, [172, 178, 192]], [0.3, [98, 110, 136]], [-9, [50, 60, 90]]];
  const FOREST = [[0.55, [62, 90, 92]], [0.3, [43, 68, 74]], [-9, [28, 48, 58]]];

  function render(terrain, dest, W, H, horizonRatio) {
    const { view, center } = dest;
    const metresPerPx = (EARTH * Math.cos((center[0] * Math.PI) / 180)) / (2 ** ZOOM * TILE);
    const [tx, ty] = tileCoord(view.lat, view.lon);
    const camX = (tx - terrain.originX) * TILE;
    const camY = (ty - terrain.originY) * TILE;
    const b = (view.bearing * Math.PI) / 180;
    const fx = Math.sin(b);
    const fy = -Math.cos(b);
    const rx = Math.cos(b);
    const ry = Math.sin(b);
    // Wide screens see more terrain instead of magnifying it past the elevation data's resolution.
    const K = Math.min(W, H * 0.62) / (2 * Math.tan(((view.fov || 30) * Math.PI) / 360));
    const horizon = H * horizonRatio;

    // Light from the viewer's left, slightly behind the ridges.
    const lLen = Math.hypot(0.8, 0.25, 0.55);
    const lx = (-rx * 0.8 - fx * 0.25) / lLen;
    const ly = (-ry * 0.8 - fy * 0.25) / lLen;
    const lz = 0.55 / lLen;

    const { h } = terrain;
    const sample = (x, y) => {
      const x0 = x | 0;
      const y0 = y | 0;
      const ax = x - x0;
      const ay = y - y0;
      const i = y0 * GRID + x0;
      return (h[i] * (1 - ax) + h[i + 1] * ax) * (1 - ay) + (h[i + GRID] * (1 - ax) + h[i + GRID + 1] * ax) * ay;
    };

    const lift = view.lift || 1.4;
    const pixels = new Uint8ClampedArray(W * H * 4);
    const angle = new Float32Array(W * H);
    const forest = new Uint8Array(W * H);
    const depth = new Float32Array(W * H);
    const top = new Int32Array(W).fill(H);

    for (let z = view.near || 5000; z < 42000; z += Math.max(14, z * 0.004)) {
      for (let sx = 0; sx < W; sx++) {
        const a = (sx - W / 2) / K;
        const x = camX + ((fx + a * rx) * z) / metresPerPx;
        const y = camY + ((fy + a * ry) * z) / metresPerPx;
        if (x < 1 || y < 1 || x >= GRID - 2 || y >= GRID - 2) continue;
        const elev = sample(x, y);
        // Vertical exaggeration, as hand-painted panoramas do.
        const drawn = 1500 + (elev - 1500) * lift;
        const sy = Math.max(0, (horizon + ((view.alt - drawn) / z) * K) | 0);
        if (sy >= top[sx]) continue;
        // The nearest slice only sets the start line, or it would hang down as a curtain.
        if (top[sx] === H) {
          top[sx] = sy;
          continue;
        }

        const gx = (sample(x + 1, y) - sample(x - 1, y)) / (2 * metresPerPx);
        const gy = (sample(x, y + 1) - sample(x, y - 1)) / (2 * metresPerPx);
        const norm = Math.hypot(gx, gy, 1);
        const shade = (-gx * lx * 1.25 - gy * ly * 1.25 + lz) / norm;
        const slope = Math.atan(Math.hypot(gx, gy));
        // Broad variation keeps gentle slopes from washing out to blank white.
        const mottled = shade + Math.sin(x * 0.9) * Math.cos(y * 1.1) * 0.05 + Math.sin(x * 0.045 + y * 0.03) * Math.cos(y * 0.06 - x * 0.02) * 0.12;
        const treeline = dest.treeline + Math.sin(x * 0.07 + y * 0.05) * 110;
        // Clearings break the forest into patches of snow, as winter woods do.
        const clearing = noise(x * 0.09, y * 0.09) * 0.65 + noise(x * 0.31, y * 0.31) * 0.35 > 0.7;
        const isForest = elev < treeline && !clearing;
        const color = isForest ? ramp(mottled, FOREST) : slope > 0.82 ? ramp(mottled, ROCK) : snowColor(mottled);

        const haze = Math.min(1, z / 42000) ** 1.6 * 0.55;
        // The nearest ground dissolves into pale mist, so low-detail slopes never read as hard shapes.
        const mist = Math.max(0, 1 - (z - (view.near || 5000)) / 3000) * 0.6;
        const r = (color[0] * (1 - haze) + 178 * haze) * (1 - mist) + 240 * mist;
        const g = (color[1] * (1 - haze) + 202 * haze) * (1 - mist) + 245 * mist;
        const bl = (color[2] * (1 - haze) + 224 * haze) * (1 - mist) + 250 * mist;
        const dirX = gx * rx + gy * ry;
        const dirY = -(gx * fx + gy * fy) * 0.6 - 0.15;
        const stroke = Math.atan2(dirY, dirX);

        for (let py = sy; py < top[sx]; py++) {
          const i = py * W + sx;
          pixels[i * 4] = r;
          pixels[i * 4 + 1] = g;
          pixels[i * 4 + 2] = bl;
          pixels[i * 4 + 3] = 255;
          angle[i] = stroke;
          depth[i] = z;
          forest[i] = isForest && z < 16000 && mist < 0.25 ? 1 : 0;
        }
        top[sx] = sy;
      }
    }
    // Below the nearest terrain the painting fades into bare snow.
    for (let sx = 0; sx < W; sx++) {
      for (let py = H - 1; py >= 0; py--) {
        const i = py * W + sx;
        if (pixels[i * 4 + 3]) break;
        pixels[i * 4] = 232;
        pixels[i * 4 + 1] = 240;
        pixels[i * 4 + 2] = 247;
        pixels[i * 4 + 3] = 255;
        angle[i] = 0.2;
      }
    }
    // Maps a real coordinate onto the painting, for pistes and labels.
    const project = (lat, lon) => {
      const [px, py] = tileCoord(lat, lon);
      const x = (px - terrain.originX) * TILE;
      const y = (py - terrain.originY) * TILE;
      if (x < 1 || y < 1 || x >= GRID - 2 || y >= GRID - 2) return null;
      const dx = (x - camX) * metresPerPx;
      const dy = (y - camY) * metresPerPx;
      const z = dx * fx + dy * fy;
      if (z <= 0) return null;
      const sx = W / 2 + ((dx * rx + dy * ry) / z) * K;
      const sy = horizon + ((view.alt - (1500 + (sample(x, y) - 1500) * lift)) / z) * K;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
      const surface = depth[(sy | 0) * W + (sx | 0)];
      return { x: sx, y: sy, z, scale: K / z, visible: surface > 0 && surface > z - (z * 0.05 + 400) };
    };
    return { pixels, angle, forest, project };
  }

  function paintSky(ctx, W, H) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, "#4f82b5");
    sky.addColorStop(0.65, "#a9c6df");
    sky.addColorStop(1, "#e3edf5");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Dry brush: each pass is a bundle of thin bristles of different lengths.
    ctx.lineCap = "butt";
    ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H * 0.55;
      const length = 80 + Math.random() * W * 0.5;
      const bristles = (6 + Math.random() * 12) | 0;
      for (let n = 0; n < bristles; n++) {
        const start = x + Math.random() * length * 0.25;
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(start, y + n * 1.6);
        ctx.lineTo(start + length * (0.45 + Math.random() * 0.55), y + n * 1.6 + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
    }
  }

  function makeStrokes(W, H, scene, unit) {
    const count = Math.round((W * H) / (5 * unit));
    const strokes = [];
    for (let n = 0; n < count; n++) {
      const x = (Math.random() * W) | 0;
      const y = (Math.random() * H) | 0;
      const i = y * W + x;
      if (!scene.pixels[i * 4 + 3]) continue;
      strokes.push({ x, y, i, order: y + Math.random() * H * 0.12 });
    }
    return strokes.sort((a, b) => a.order - b.order);
  }

  function drawStroke(ctx, s, scene, H, unit) {
    const p = scene.pixels;
    const depth = 0.45 + (s.y / H) * 0.9;
    const a = scene.angle[s.i] + (Math.random() - 0.5) * 0.6;
    const len = (1.5 + Math.random() * 5.5) * depth * unit;
    ctx.strokeStyle = `rgb(${p[s.i * 4]},${p[s.i * 4 + 1]},${p[s.i * 4 + 2]})`;
    ctx.lineWidth = (1.3 + Math.random() * 2.9) * depth * unit;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(a) * len, s.y - Math.sin(a) * len);
    ctx.lineTo(s.x + Math.cos(a) * len, s.y + Math.sin(a) * len);
    ctx.stroke();
  }

  function drawTrees(ctx, W, H, scene, unit) {
    const tones = ["#1c3039", "#24403f", "#16282f", "#2f4d4f"];
    const tries = (W * H) / (90 * unit);
    ctx.lineCap = "round";
    for (let n = 0; n < tries; n++) {
      const x = (Math.random() * W) | 0;
      const y = (Math.random() * H) | 0;
      if (!scene.forest[y * W + x]) continue;
      const size = (1.4 + (y / H) * 3.6) * unit * (0.6 + Math.random() * 0.9);
      // Two dabs of the brush: a body, and a lighter touch on the lit side.
      const lean = (Math.random() - 0.5) * size * 0.5;
      const height = size * (1.1 + Math.random() * 1.1);
      ctx.strokeStyle = tones[(Math.random() * tones.length) | 0];
      // A wide base and a narrow tip read as a fir, not a capsule.
      ctx.lineWidth = size * (0.55 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean * 0.5, y - height * 0.55);
      ctx.stroke();
      ctx.lineWidth = size * 0.28;
      ctx.beginPath();
      ctx.moveTo(x + lean * 0.5, y - height * 0.55);
      ctx.lineTo(x + lean, y - height);
      ctx.stroke();
      if (Math.random() < 0.25) {
        ctx.strokeStyle = "#5c7a7c";
        ctx.lineWidth = size * 0.28;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.3, y - size * 0.25);
        ctx.lineTo(x - size * 0.2 + lean, y - size * 1.1);
        ctx.stroke();
      }
    }
  }

  function drawPistes(ctx, features, scene, unit) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const runs = [];
    features.forEach((feature) => {
      const color = PISTE_COLORS[feature.properties.d];
      const line = feature.geometry.coordinates;
      // Closed ways are piste areas, which would paint as hatched slabs.
      const closed = line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
      if (!color || closed) return;
      let run = [];
      const flush = () => {
        if (run.length > 1) runs.push({ color, points: run });
        run = [];
      };
      line.forEach(([lon, lat]) => {
        const point = scene.project(lat, lon);
        if (point?.visible) run.push(point);
        else flush();
      });
      flush();
    });

    const trace = ({ points }) => {
      ctx.beginPath();
      points.forEach((point, i) => {
        const x = point.x + (Math.random() - 0.5) * 0.7 * unit;
        const y = point.y + (Math.random() - 0.5) * 0.7 * unit;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
    };
    const widthOf = ({ points }) => Math.min(2.2, Math.max(0.9, points[points.length >> 1].scale * 26)) * unit;

    // A pale edge under every run first, so colours stay continuous ribbons.
    ctx.strokeStyle = "#f7f9fb";
    ctx.globalAlpha = 0.6;
    runs.forEach((run) => {
      ctx.lineWidth = widthOf(run) + 1.6 * unit;
      trace(run);
      ctx.stroke();
    });
    ctx.globalAlpha = 0.92;
    runs.forEach((run) => {
      ctx.strokeStyle = run.color;
      ctx.lineWidth = widthOf(run);
      trace(run);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawLabels(ctx, labels, scene, W, unit) {
    const size = 14 * unit;
    ctx.font = `600 ${size}px Barlow, sans-serif`;
    ctx.textBaseline = "alphabetic";
    const placed = [];
    labels.forEach((label) => {
      const point = scene.project(label.lat, label.lon);
      if (!point) return;
      const textWidth = ctx.measureText(label.name).width;
      const left = Math.min(W - textWidth - 8 * unit, Math.max(8 * unit, point.x - textWidth / 2));
      let rise = (label.peak ? 12 : 20) * unit;
      // Lift a label until it clears the ones already placed.
      while (placed.some((box) => left < box.right && left + textWidth > box.left && Math.abs(point.y - rise - box.y) < size * 1.3)) rise += size * 0.7;
      const top = point.y - rise;
      placed.push({ left, right: left + textWidth, y: top });
      ctx.strokeStyle = "#10192b";
      ctx.lineWidth = 1.5 * unit;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x, top);
      ctx.stroke();
      const x = left;
      ctx.lineWidth = 4 * unit;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#f7f9fb";
      ctx.strokeText(label.name, x, top - 3 * unit);
      ctx.fillStyle = "#10192b";
      ctx.fillText(label.name, x, top - 3 * unit);
    });
  }

  // Painted grain for the page's physical surfaces: boards, the post, the paper.
  globalThis.paintGrain = function paintGrain(w, h, base, tones, { vertical = false, fibre = false, passes = 700 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < passes; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const length = 20 + Math.random() * (vertical ? h : w) * 0.5;
      ctx.strokeStyle = tones[(Math.random() * tones.length) | 0];
      ctx.globalAlpha = 0.08 + Math.random() * 0.22;
      ctx.lineWidth = 0.5 + Math.random() * 1.6;
      const a = Math.random() * Math.PI * 2;
      const end = fibre
        ? [Math.cos(a) * 9, Math.sin(a) * 9]
        : vertical ? [(Math.random() - 0.5) * 3, length] : [length, (Math.random() - 0.5) * 3];
      // Painting every stroke at all wrapped offsets makes the tile seamless.
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + end[0], y + oy + end[1]);
          ctx.stroke();
        }
      }
    }
    return `url(${canvas.toDataURL("image/png")})`;
  };

  // The turnstile arm: ink and sky bands, so it stands out against the snow, laid on with a rough brush, repeating sideways.
  globalThis.paintArm = function paintArm(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    const bands = [
      [0, 0.64, ["#10192b", "#1b3257", "#2b3a55", "#050a14"]],
      [0.64, 1, ["#a9c6df", "#8fb0cc", "#c5d6e4", "#5c7fad"]],
    ];
    for (const [from, to, tones] of bands) {
      for (let i = 0; i < w * h * (to - from) * 0.5; i++) {
        const x = (from + Math.random() * (to - from)) * w;
        const y = 2 + Math.random() * (h - 4);
        const length = 3 + Math.random() * 7;
        ctx.strokeStyle = tones[(Math.random() * tones.length) | 0];
        ctx.lineWidth = 1 + Math.random() * 2.5;
        for (const ox of [-w, 0, w]) {
          ctx.beginPath();
          ctx.moveTo(x + ox - length / 2, y);
          ctx.lineTo(x + ox + length / 2, y + (Math.random() - 0.5) * 1.5);
          ctx.stroke();
        }
      }
    }
    return `url(${canvas.toDataURL("image/png")})`;
  };

  // Gaps for a mask, so a rubber stamp's ink breaks up on the paper.
  globalThis.paintSpeckle = function paintSpeckle(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < (w * h) / 22; i++) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.75;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 0.3 + Math.random() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    return `url(${canvas.toDataURL("image/png")})`;
  };

  // A torn brush edge, used as a mask where one chapter meets the next.
  globalThis.paintEdge = function paintEdge(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    for (let i = 0; i < w * 1.4; i++) {
      const x = Math.random() * w;
      const reach = h * (0.25 + noise(x * 0.012, 3) * 0.75);
      ctx.lineWidth = 2 + Math.random() * 7;
      for (const ox of [-w, 0, w]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, h);
        ctx.lineTo(x + ox + (Math.random() - 0.5) * 8, h - reach * (0.6 + Math.random() * 0.4));
        ctx.stroke();
      }
    }
    return `url(${canvas.toDataURL("image/png")})`;
  };

  // Repaints an authored SVG scene with the same brush as the panoramas.
  globalThis.paintScene = async function paintScene(canvas, svg, keep = []) {
    const rect = canvas.getBoundingClientRect();
    const unit = rect.width > 900 ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    const W = Math.round(rect.width * unit);
    const H = Math.round(rect.height * unit);
    canvas.width = W;
    canvas.height = H;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const img = await loadImage(url);
    URL.revokeObjectURL(url);
    const source = document.createElement("canvas");
    source.width = W;
    source.height = H;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    sourceCtx.drawImage(img, 0, 0, W, H);
    const scene = { pixels: sourceCtx.getImageData(0, 0, W, H).data, angle: new Float32Array(W * H) };
    for (let i = 0; i < scene.angle.length; i++) scene.angle[i] = (Math.random() - 0.5) * 0.6;
    // Painted offscreen in short slices: scrolling stays smooth and only the finished scene shows.
    const work = document.createElement("canvas");
    work.width = W;
    work.height = H;
    const ctx = work.getContext("2d");
    ctx.drawImage(source, 0, 0);
    ctx.lineCap = "round";
    let sliceStart = performance.now();
    const paced = async (count, paint) => {
      for (let n = 0; n < count; n++) {
        paint(n);
        if (n % 128 === 127 && performance.now() - sliceStart > 8) {
          await new Promise((resolve) => setTimeout(resolve));
          sliceStart = performance.now();
        }
      }
    };
    // The brush grows with the scene, or a wide screen reads as vector art.
    const brush = Math.max(unit, W / 375);
    const strokes = makeStrokes(W, H, scene, brush);
    await paced(strokes.length, (n) => drawStroke(ctx, strokes[n], scene, H * 0.95, brush));
    // Details too small for the big brush are restamped softly, as fractions of the scene.
    // Fine ones get a smaller brush first, so they stay in the painted register.
    for (const [x, y, w, h, fine] of keep) {
      if (fine) {
        await paced((w * W * h * H) / (6 * brush), () => {
          const px = ((x + Math.random() * w) * W) | 0;
          const py = ((y + Math.random() * h) * H) | 0;
          drawStroke(ctx, { x: px, y: py, i: py * W + px }, scene, H * 0.95, brush * 0.45);
        });
      }
      ctx.globalAlpha = fine ? 0.45 : 0.85;
      ctx.drawImage(source, x * W, y * H, w * W, h * H, x * W, y * H, w * W, h * H);
      ctx.globalAlpha = 1;
    }
    canvas.getContext("2d").drawImage(work, 0, 0);
    canvas.dataset.painted = "true";
  };

  globalThis.paintPanorama = async function paintPanorama(canvas, dest, { animate = true, horizon = 0.22, peaksOnly = false } = {}) {
    const rect = canvas.getBoundingClientRect();
    // Large screens stay at one canvas pixel per CSS pixel, or painting takes too long.
    const unit = rect.width > 900 ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    const W = Math.max(320, Math.round(rect.width * unit));
    const H = Math.max(320, Math.round(rect.height * unit));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    paintSky(ctx, W, H);

    let terrain;
    let synthetic = false;
    try {
      terrain = await loadHeights(dest);
    } catch {
      synthetic = true;
      terrain = { h: syntheticHeights(), originX: tileCoord(...dest.center).map(Math.floor)[0] - 1, originY: tileCoord(...dest.center).map(Math.floor)[1] - 1 };
    }

    const scene = render(terrain, dest, W, H, horizon);
    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    base.getContext("2d").putImageData(new ImageData(scene.pixels, W, H), 0, 0);

    const [pistes] = await Promise.all([
      synthetic ? null : fetch(`data/pistes-${dest.id}.geojson`).then((r) => r.json()).catch(() => null),
      document.fonts?.load("600 16px Barlow"),
    ]);

    ctx.filter = "blur(1.5px)";
    ctx.globalAlpha = 0.7;
    ctx.drawImage(base, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.lineCap = "round";

    const strokes = makeStrokes(W, H, scene, unit);
    const finish = () => {
      // A soft wash of the underpainting brings back the mountain's form under the strokes.
      ctx.filter = "blur(2px)";
      ctx.globalAlpha = 0.34;
      ctx.drawImage(base, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      drawTrees(ctx, W, H, scene, unit);
      if (pistes) drawPistes(ctx, pistes.features, scene, unit);
      if (!synthetic) drawLabels(ctx, peaksOnly ? dest.labels.filter((l) => l.peak) : dest.labels, scene, W, unit);
      const fade = ctx.createLinearGradient(0, H * 0.88, 0, H);
      fade.addColorStop(0, "rgba(247,249,251,0)");
      fade.addColorStop(1, "rgba(247,249,251,1)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, H * 0.88, W, H * 0.12);
    };

    if (!animate || document.hidden) {
      strokes.forEach((s) => drawStroke(ctx, s, scene, H, unit));
      finish();
      canvas.dataset.painted = "true";
      return { synthetic };
    }
    const perFrame = Math.ceil(strokes.length / 90);
    await new Promise((resolve) => {
      let cursor = 0;
      const started = performance.now();
      // The timer keeps painting when the browser throttles animation frames.
      const next = () => {
        let done = false;
        const once = () => {
          if (done) return;
          done = true;
          frame();
        };
        requestAnimationFrame(once);
        setTimeout(once, 100);
      };
      const frame = () => {
        // Past the ceiling the animation stops being a treat: finish at once.
        const late = performance.now() - started > 2500;
        const end = late ? strokes.length : Math.min(strokes.length, cursor + perFrame);
        for (; cursor < end; cursor++) drawStroke(ctx, strokes[cursor], scene, H, unit);
        if (cursor < strokes.length) next();
        else {
          finish();
          canvas.dataset.painted = "true";
          resolve();
        }
      };
      next();
    });
    return { synthetic };
  };
})();
