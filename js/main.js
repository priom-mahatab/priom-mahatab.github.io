// Trajectory portfolio.
//
// Landing: a point cloud of the portrait. Every point sits on the ray from the start camera through one cell of a
// halftone of the photo, at its own random depth, with its size scaled by that depth — so from the start position the
// cloud reads as a flat portrait, and any movement pulls it apart (like a depth camera seeing a face).
// Scrolling drives the camera along a planned trajectory. Each content section is a waypoint gate followed by its cards;
// the camera slows and turns toward each card as it passes. Click a card to open its details.

import * as THREE from "three";
import { profile, sections } from "./content.js";

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pad2 = (n) => String(n).padStart(2, "0");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const COLORS = { bg: "#07090b", ink: "#e9ece8", mute: "#8b938e", accent: "#ff6a2b" };
const FOV = 50;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const CARD_W = 9, CARD_H = 6;
const PORTRAIT = { near: 70, far: 360, height: 0.98, crop: 0.84 }; // reference scale: head ≈ top half, shoulders below // height: share of the screen; crop: top share of the figure
const LAYOUT = { start: -470, gateToFirst: 62, itemGap: 66, sectionGap: 115, gateView: 24, endPad: 70 };
const FLOOR_Y = -7;

// ---------- boot log ----------
const bootLog = $("#boot-log");
const log = (msg) => { bootLog.textContent += msg + "\n"; };
log("> trajectory v1 — boot");

// ---------- static text ----------
for (const el of document.querySelectorAll("[data-bind]")) {
  const v = profile[el.dataset.bind];
  if (v) el.textContent = v;
}
document.title = `${profile.name} · ${profile.role}`;

// ---------- renderer / scene ----------
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(COLORS.bg, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.bg, 40, 430);
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 3000);
log("[ ok ] renderer online — webgl" + (renderer.capabilities.isWebGL2 ? "2" : ""));

// ---------- trajectory ----------
const amp = (z) => smooth(260, 760, -z); // straight at the start so the portrait lines up
const pathX = (z) => Math.sin(z * 0.0031) * 7 * amp(z);
const pathY = (z) => Math.sin(z * 0.0018 + 0.6) * 2.2 * amp(z);

// ---------- layout of waypoints and cards ----------
const gates = [];
const cards = [];
{
  let z = LAYOUT.start;
  sections.forEach((sec, si) => {
    gates.push({ sec, si, z });
    z -= LAYOUT.gateToFirst;
    sec.items.forEach((item, ii) => {
      cards.push({ item, sec, si, ii, z, side: ii % 2 === 0 ? 1 : -1, yOff: [0.5, -0.4, 0.2][ii % 3] });
      z -= LAYOUT.itemGap;
    });
    z -= LAYOUT.sectionGap - LAYOUT.itemGap;
  });
}
const lastZ = cards.length ? cards[cards.length - 1].z : LAYOUT.start;
const END_S = -lastZ + LAYOUT.endPad;
const TOTAL = END_S + 400;

// ---------- helpers ----------
const makeCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
function texFrom(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const isSvg = (src) => /\.svg($|\?)/i.test(String(src || ""));
async function loadImage(src) {
  if (!src) return null;
  let url = src;
  if (isSvg(src)) {
    // give the SVG an explicit, large pixel size so it rasterises sharply onto the card
    try {
      const text = await (await fetch(src)).text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
      let w = parseFloat(svg.getAttribute("width")) || vb[2] || 300, h = parseFloat(svg.getAttribute("height")) || vb[3] || 150;
      const k = 1600 / Math.max(w, h);
      svg.setAttribute("width", String(w * k)); svg.setAttribute("height", String(h * k));
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    } catch { /* fall back to loading it directly */ }
  }
  return new Promise((res) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => { im.isLogo = isSvg(src); res(im); };
    im.onerror = () => res(null);
    im.src = url;
  });
}
function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bracketGeo(w, h, l) {
  const x = w / 2, y = h / 2;
  const p = [
    -x, y - l, 0, -x, y, 0, -x, y, 0, -x + l, y, 0,
    x - l, y, 0, x, y, 0, x, y, 0, x, y - l, 0,
    x, -y + l, 0, x, -y, 0, x, -y, 0, x - l, -y, 0,
    -x + l, -y, 0, -x, -y, 0, -x, -y, 0, -x, -y + l, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return g;
}
function wrapLines(g, text, maxW, maxLines) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (g.measureText(l + "…").width > maxW && l.length) l = l.slice(0, -1);
    lines[maxLines - 1] = l + "…";
  }
  return lines;
}

// ---------- portrait point cloud ----------
function fallbackPortrait() {
  const c = makeCanvas(400, 500), g = c.getContext("2d");
  const head = g.createRadialGradient(185, 160, 10, 200, 190, 115);
  head.addColorStop(0, "rgba(255,255,255,1)");
  head.addColorStop(1, "rgba(255,255,255,0.2)");
  g.fillStyle = head;
  g.beginPath(); g.ellipse(200, 190, 84, 106, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,0.45)";
  g.fillRect(166, 275, 68, 60);
  const body = g.createLinearGradient(0, 320, 0, 500);
  body.addColorStop(0, "rgba(255,255,255,0.85)");
  body.addColorStop(1, "rgba(255,255,255,0.25)");
  g.fillStyle = body;
  g.beginPath(); g.moveTo(18, 500);
  g.bezierCurveTo(28, 375, 120, 332, 200, 328);
  g.bezierCurveTo(280, 332, 372, 375, 382, 500);
  g.closePath(); g.fill();
  return c;
}

// ---------- tile atlas: the little "work" thumbnails the portrait and the dust are made of ----------
// Crops of your project photos, mixed with generated robotics/ML visuals. Tiles are sorted by brightness so the
// portrait can pick a tile that matches each cell of the photo.
const ATLAS = { grid: 16, tile: 64 };
let atlasTexture = null, tilesByLum = [];
// a cool, cohesive palette (whites, blues, violets) with the orange accent used sparingly
const PALETTE = ["#e9ece8", "#cfd8ff", "#7aa2ff", "#4f6bff", "#9a7bff", "#c7b6ff", "#e9ece8", "#ff6a2b"];
const COOL_STOPS = [[11, 16, 38], [31, 58, 147], [79, 107, 255], [154, 123, 255], [232, 230, 255]];
// dark navy → blue → violet → near-white; stands in for the rainbow maps used in depth/LiDAR tools
function cool(t) {
  t = clamp(t, 0, 1) * (COOL_STOPS.length - 1);
  const i = Math.min(Math.floor(t), COOL_STOPS.length - 2), f = t - i, a = COOL_STOPS[i], b = COOL_STOPS[i + 1];
  return `rgb(${(a[0] + (b[0] - a[0]) * f) | 0},${(a[1] + (b[1] - a[1]) * f) | 0},${(a[2] + (b[2] - a[2]) * f) | 0})`;
}

function turbo(t) {
  t = clamp(t, 0, 1);
  const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
  return `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
}
const pickColor = (r) => PALETTE[Math.floor(r() * PALETTE.length)];

const TILE_KINDS = {
  depth(g, x, y, s, r) { // depth image, turbo colour map
    const n = 16, c = s / n, p = [r() * 6, r() * 6], f = 0.12 + r() * 0.3, base = r() * 0.5;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = cool(base + 0.5 * (0.5 + 0.5 * Math.sin(i * f + p[0]) * Math.cos(j * f * 0.8 + p[1])));
      g.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5);
    }
  },
  lidar(g, x, y, s, r) { // top-down scan, coloured by range
    g.fillStyle = "#06080a"; g.fillRect(x, y, s, s);
    const ph = r() * 6, lobes = 2 + Math.floor(r() * 4);
    for (let k = 0; k < 260; k++) {
      const a = (k / 260) * Math.PI * 2, rad = s * (0.2 + 0.22 * (0.5 + 0.5 * Math.sin(a * lobes + ph))) + (r() - 0.5) * 3;
      g.fillStyle = cool(rad / (s * 0.45));
      g.fillRect(x + s / 2 + Math.cos(a) * rad, y + s / 2 + Math.sin(a) * rad, 2, 2);
    }
    g.fillStyle = COLORS.accent; g.fillRect(x + s / 2 - 2, y + s / 2 - 2, 4, 4);
  },
  occupancy(g, x, y, s, r) { // occupancy grid + planned path
    g.fillStyle = r() < 0.5 ? "#0e1215" : "#c9cec9"; const dark = g.fillStyle === "#0e1215"; g.fillRect(x, y, s, s);
    const n = 8, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r() < 0.32) {
      g.fillStyle = dark ? `rgba(233,236,232,${0.3 + r() * 0.6})` : `rgba(10,12,14,${0.5 + r() * 0.5})`;
      g.fillRect(x + i * c + 1, y + j * c + 1, c - 2, c - 2);
    }
    g.strokeStyle = COLORS.accent; g.lineWidth = 2; g.beginPath();
    let py = y + s * r(); g.moveTo(x, py);
    for (let k = 1; k <= 4; k++) { py = clamp(py + (r() - 0.5) * s * 0.5, y + 4, y + s - 4); g.lineTo(x + (s * k) / 4, py); }
    g.stroke();
  },
  marker(g, x, y, s, r) { // ArUco-style fiducial
    g.fillStyle = "#f4f4f0"; g.fillRect(x, y, s, s);
    const b = s * 0.12, inner = s - 2 * b; g.fillStyle = "#0a0a0a"; g.fillRect(x + b, y + b, inner, inner);
    const n = 6, c = inner / n; g.fillStyle = "#f4f4f0";
    for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) if (r() < 0.5) g.fillRect(x + b + i * c, y + b + j * c, c, c);
  },
  heat(g, x, y, s, r) { // attention / confusion matrix
    const n = 6 + Math.floor(r() * 5), c = s / n, hue = r() < 0.85 ? 228 : 18;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const t = clamp((i === j ? 0.7 : 0.1) + r() * 0.5 - Math.abs(i - j) * 0.05, 0, 1);
      g.fillStyle = `hsl(${hue + t * 30},70%,${6 + t * 70}%)`;
      g.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5);
    }
  },
  plot(g, x, y, s, r) { // training curve
    const light = r() < 0.4;
    g.fillStyle = light ? "#f2f2ee" : "#0d1013"; g.fillRect(x, y, s, s);
    g.strokeStyle = light ? "#9aa09c" : "#3a4044"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 6, y + 4); g.lineTo(x + 6, y + s - 6); g.lineTo(x + s - 4, y + s - 6); g.stroke();
    for (let line = 0; line < 2; line++) {
      g.strokeStyle = pickColor(r); g.lineWidth = 2; g.beginPath();
      const k = 2 + r() * 4, off = r() * 0.3;
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, v = Math.exp(-k * t) * (0.8 - off) + off * 0.3 + (r() - 0.5) * 0.06;
        const px = x + 8 + t * (s - 14), py = y + s - 8 - v * (s - 16);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
  },
  detect(g, x, y, s, r) { // camera frame with a detection box
    const v = 30 + r() * 120, grd = g.createLinearGradient(x, y, x + s, y + s);
    grd.addColorStop(0, `rgb(${v},${v + 8},${v + 12})`); grd.addColorStop(1, `rgb(${v * 0.4},${v * 0.45},${v * 0.5})`);
    g.fillStyle = grd; g.fillRect(x, y, s, s);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(255,255,255,${r() * 0.15})`; g.fillRect(x + r() * s, y + r() * s, r() * s * 0.5, r() * s * 0.5); }
    const col = pickColor(r), bx = x + s * (0.15 + r() * 0.2), by = y + s * (0.2 + r() * 0.2), bw = s * (0.35 + r() * 0.3), bh = s * (0.3 + r() * 0.3);
    g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(bx, by, bw, bh);
    g.fillStyle = col; g.fillRect(bx - 1, by - 7, bw * 0.6, 7);
  },
  code(g, x, y, s, r) { // syntax-highlighted source
    g.fillStyle = "#0d1117"; g.fillRect(x, y, s, s);
    const cols = ["#79c0ff", "#d2a8ff", "#a5d6ff", "#c9d1d9", "#8b9cff", "#ff6a2b"];
    for (let ly = y + 5; ly < y + s - 3; ly += 5) {
      let lx = x + 4 + Math.floor(r() * 3) * 5;
      while (lx < x + s - 6 && r() < 0.85) { const w = 4 + r() * 14; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(lx, ly, Math.min(w, x + s - 4 - lx), 2); lx += w + 3; }
    }
  },
  paper(g, x, y, s, r) { // a page from a paper
    g.fillStyle = "#f3f2ee"; g.fillRect(x, y, s, s);
    g.fillStyle = "#1a1a1a"; g.fillRect(x + 8, y + 7, s * 0.6, 4);
    const fy = y + 16 + r() * 20;
    for (let ly = y + 16; ly < y + s - 5; ly += 4) {
      if (ly > fy && ly < fy + 18) continue;
      g.fillStyle = "#9a9a96"; g.fillRect(x + 6, ly, (s - 12) * (0.6 + r() * 0.4), 1.5);
    }
    g.fillStyle = pickColor(r); g.fillRect(x + 10, fy + 2, s * 0.35, 14);
    g.fillStyle = pickColor(r); g.fillRect(x + 14 + s * 0.35, fy + 6, s * 0.3, 10);
  },
  imu(g, x, y, s, r) { // accelerometer / gyro traces
    g.fillStyle = "#0b0e10"; g.fillRect(x, y, s, s);
    ["#e9ece8", "#7aa2ff", "#b18cff"].forEach((col, k) => {
      g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath();
      const f = 0.1 + r() * 0.4, ph = r() * 6, a = 4 + r() * 10, base = y + s * (0.25 + k * 0.25);
      for (let i = 0; i <= s; i += 2) { const py = base + Math.sin(i * f + ph) * a + (r() - 0.5) * 3; i ? g.lineTo(x + i, py) : g.moveTo(x + i, py); }
      g.stroke();
    });
  },
};

function buildAtlas(photos) {
  const { grid, tile } = ATLAS, N = grid * grid;
  const c = makeCanvas(grid * tile, grid * tile), g = c.getContext("2d", { willReadFrequently: true });
  const r = rng(1234);
  const kinds = Object.values(TILE_KINDS);
  const photoShare = photos.length ? Math.min(0.45, 0.2 + photos.length * 0.05) : 0;
  for (let k = 0; k < N; k++) {
    const x = (k % grid) * tile, y = Math.floor(k / grid) * tile;
    g.save(); g.beginPath(); g.rect(x, y, tile, tile); g.clip();
    if (r() < photoShare) {
      const img = photos[Math.floor(r() * photos.length)];
      const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h) * (0.12 + r() * 0.55);
      g.drawImage(img, r() * (w - side), r() * (h - side), side, side, x, y, tile, tile);
    } else {
      kinds[Math.floor(r() * kinds.length)](g, x, y, tile, r);
    }
    g.restore();
  }
  // brightness of each tile, for matching against the portrait
  const d = g.getImageData(0, 0, c.width, c.height).data, lum = new Array(N).fill(0);
  for (let py = 0; py < c.height; py += 2) for (let px = 0; px < c.width; px += 2) {
    const i = (py * c.width + px) * 4, k = Math.floor(py / tile) * grid + Math.floor(px / tile);
    lum[k] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  tilesByLum = [...Array(N).keys()].sort((p, q) => lum[p] - lum[q]);
  atlasTexture = new THREE.CanvasTexture(c);
  atlasTexture.colorSpace = THREE.NoColorSpace; // used as-is, no conversion
  atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
  return N;
}
// a tile whose brightness roughly matches `level` (0 dark … 1 bright), with some randomness
const tileFor = (level) => tilesByLum[Math.round(clamp(level + (Math.random() - 0.5) * 0.3, 0, 1) * (tilesByLum.length - 1))];

const TILE_GLSL = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uGrid;
  vec3 tileColor(float tile) {
    vec2 cell = vec2(mod(tile, uGrid), floor(tile / uGrid));
    vec2 pc = mix(vec2(0.03), vec2(0.97), gl_PointCoord);   // inset a touch so neighbours don't bleed
    vec2 uv = (cell + pc) / uGrid;
    return texture2D(uAtlas, vec2(uv.x, 1.0 - uv.y)).rgb;
  }`;

const maxPointPx = () => Math.min(256, renderer.getContext().getParameter(renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1] || 64);

const portraitUniforms = {
  uCellPx: { value: 4 }, uIntro: { value: 0 }, uScan: { value: 2 }, uShift: { value: 0 }, uShiftY: { value: 0 },
  uScale: { value: 1 }, uTan: { value: TAN }, uFade: { value: 1 }, uMaxPx: { value: 64 }, uPhoto: { value: 0.0 }, // 0 = tiles keep their own colours (the face comes from tile size), up to 1 = photo-like
  uAtlas: { value: null }, uGrid: { value: ATLAS.grid },
  uAccent: { value: new THREE.Color(COLORS.accent) },
};
let portraitRows = 96, portraitAspect = 0.8, portrait = null;
const dustUniforms = { uPxScale: { value: 500 }, uMaxPx: { value: 64 }, uAtlas: { value: null }, uGrid: { value: ATLAS.grid } };

function buildPortrait(img) {
  const src = img || fallbackPortrait();
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;

  // find the visible subject (non-transparent pixels) so a cut-out photo fills the frame
  const probe = makeCanvas(200, Math.round((200 * ih) / iw)), pg = probe.getContext("2d", { willReadFrequently: true });
  pg.drawImage(src, 0, 0, probe.width, probe.height);
  const pd = pg.getImageData(0, 0, probe.width, probe.height).data;
  let x0 = probe.width, y0 = probe.height, x1 = 0, y1 = 0, cutout = false;
  for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) {
    const a = pd[(y * probe.width + x) * 4 + 3];
    if (a < 250) cutout = true;
    if (a > 25) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = probe.width - 1; y1 = probe.height - 1; }
  const k = iw / probe.width, m = 12; // margin leaves room for the loose halo around the silhouette
  const sx = Math.max(0, (x0 - m) * k), sy = Math.max(0, (y0 - m) * k);
  const sw = Math.min(iw, (x1 + 1 + m) * k) - sx;
  // head and shoulders only: the face is meant to fill the screen, like the reference
  const sh = (Math.min(ih, (y1 + 1 + m) * k) - sy) * (cutout ? PORTRAIT.crop : 1);

  portraitAspect = sw / sh;
  portraitRows = innerWidth < 700 ? 74 : 92; // ~40 tiles across the face, as in the reference // coarse grid: every tile reads as its own little square
  const rows = portraitRows, cols = Math.round(rows * portraitAspect);
  const c = makeCanvas(cols, rows), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, sx, sy, sw, sh, 0, 0, cols, rows);
  const d = g.getImageData(0, 0, cols, rows).data;
  // a blurred copy of the silhouette: tiles thin out across this soft edge instead of stopping at a hard line
  const sc = makeCanvas(cols, rows), sg = sc.getContext("2d", { willReadFrequently: true });
  sg.filter = `blur(${Math.max(1.5, cols * 0.03)}px)`;
  sg.drawImage(c, 0, 0);
  const sd = sg.getImageData(0, 0, cols, rows).data;

  // stretch brightness across the subject only, so dark skin / dark clothes still get detail
  // local contrast: compare each cell with a blurred surround, so features (eyes, brows, nostrils, mouth) stand out
  // even in an evenly lit photo; the reference portrait gets this from strong side lighting
  const bc = makeCanvas(cols, rows), bgx = bc.getContext("2d", { willReadFrequently: true });
  bgx.filter = `blur(${Math.max(2, cols * 0.07)}px)`;
  bgx.drawImage(c, 0, 0);
  const bd = bgx.getImageData(0, 0, cols, rows).data;
  const lumRaw = (arr, i) => (0.299 * arr[i] + 0.587 * arr[i + 1] + 0.114 * arr[i + 2]) / 255;
  const lumAt = (i) => { const a = lumRaw(d, i); return clamp(a + 1.4 * (a - lumRaw(bd, i)), 0, 1); };
  const lums = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) lums.push(lumAt(i));
  lums.sort((p, q) => p - q);
  const lo = lums[Math.floor(lums.length * 0.04)] ?? 0, hi = lums[Math.floor(lums.length * 0.985)] ?? 1;
  // histogram-equalised brightness (rank among the subject's pixels): spreads the face's own tones over the whole
  // range, so eyes, brows and mouth separate clearly from cheeks and forehead even when the shirt is brighter
  const level = (l) => {
    let a = 0, b = lums.length;
    while (a < b) { const m = (a + b) >> 1; if (lums[m] < l) a = m + 1; else b = m; }
    return lums.length ? a / lums.length : clamp((l - lo) / Math.max(hi - lo, 0.05), 0, 1);
  };

  const pos = [], depth = [], size = [], vv = [], seed = [], scatter = [], tiles = [], bright = [], tint = [];
  const H = PORTRAIT.height;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const i = (r * cols + col) * 4;
      // small jitter inside the cell so the grid doesn't read as rigid
      const nx = ((col + 0.5) / cols) * 2 - 1, ny = 1 - ((r + 0.5) / rows) * 2; // strict grid, like the reference
      // presence: the soft silhouette for cut-outs, a soft vignette for ordinary photos
      let soft = cutout ? sd[i + 3] / 255 : 1 - smooth(0.6, 1.0, Math.hypot(nx * 0.95, ny * 0.9));
      // V-shaped bottom: the shoulders are cut on two diagonals meeting at the bottom centre, with a ragged edge
      const vEdge = ny + 1 - Math.abs(nx) * 0.62 + (Math.random() - 0.5) * 0.07; // gentle V: shoulders stay, tip at the bottom centre
      soft *= smooth(0.0, 0.14, vEdge);
      if (soft < 0.03) continue;
      // brightness; pixels outside the hard edge count as shadow
      const L = d[i + 3] > 128 || !cutout ? (cutout ? level(lumAt(i)) : lumAt(i)) : 0;
      // every cell inside the silhouette gets a tile; only the soft edge thins out
      if (Math.random() > Math.pow(soft, 1.5)) continue;
      const dz = lerp(PORTRAIT.near, PORTRAIT.far, Math.pow(Math.random(), 0.8));
      pos.push(nx * H * portraitAspect * dz * TAN, ny * H * dz * TAN, -dz);
      depth.push(dz);
      // the face comes from tile SIZE alone: near-full squares (with a gap) in the light, tiny specks in shadow
      size.push((0.14 + 0.68 * Math.pow(L, 1.5)) * (0.65 + 0.35 * soft));
      // tiles are mostly random thumbnails (dark ones become the black gaps), only loosely biased by brightness
      tiles.push(tileFor(lerp(Math.random(), L, 0.7)));
      bright.push(0.5 + 0.6 * L);
      const grey = d[i + 3] > 128 || !cutout ? Math.min(1, 0.2 + 0.85 * L) : 0.12;
      tint.push(grey, grey, grey);
      vv.push(ny);
      seed.push(Math.random());
      const ang = Math.random() * Math.PI * 2, rad = 20 + Math.random() * 60;
      scatter.push(Math.cos(ang) * rad, Math.sin(ang) * rad, (Math.random() - 0.5) * 120);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depth, 1));
  geo.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute("aV", new THREE.Float32BufferAttribute(vv, 1));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  geo.setAttribute("aScatter", new THREE.Float32BufferAttribute(scatter, 3));
  geo.setAttribute("aTile", new THREE.Float32BufferAttribute(tiles, 1));
  geo.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
  geo.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 3));
  portraitUniforms.uAtlas.value = atlasTexture;
  portraitUniforms.uMaxPx.value = maxPointPx();
  const mat = new THREE.ShaderMaterial({
    uniforms: portraitUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uCellPx, uIntro, uScan, uShift, uShiftY, uScale, uTan, uMaxPx;
      attribute float aDepth, aSize, aV, aSeed, aTile, aBright;
      attribute vec3 aTint;
      varying vec3 vTint;
      varying float vNear;
      attribute vec3 aScatter;
      varying float vAlpha, vScan, vTile, vBright;
      void main() {
        vec3 p = position;
        p.xy *= uScale;
        p.x += uShift * aDepth * uTan;
        p.y += uShiftY * aDepth * uTan;
        float t = clamp(uIntro * 1.5 - aSeed * 0.5, 0.0, 1.0);
        t = 1.0 - pow(1.0 - t, 3.0);
        p += aScatter * (1.0 - t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uCellPx * uScale * aDepth / max(dist, 0.001), uMaxPx);
        vScan = exp(-pow((aV - uScan) * 22.0, 2.0));
        vAlpha = smoothstep(0.5, 6.0, dist) * t;
        vTile = aTile;
        // tiles get their true colours as they come close; from afar they are dimmed to the photo's brightness
        vNear = smoothstep(24.0, 5.0, dist);
        vBright = mix(aBright, 1.0, vNear);
        vTint = aTint;
      }`,
    fragmentShader: /* glsl */ `
      ${TILE_GLSL}
      uniform vec3 uAccent;
      uniform float uFade;
      varying float vAlpha, vScan, vTile, vBright, vNear;
      varying vec3 vTint;
      uniform float uPhoto;
      void main() {
        vec3 col = tileColor(vTile) * vBright;
        col = mix(col, vTint, uPhoto * (1.0 - vNear)); // far: the photo reads; near: the tile's own image
        col = mix(col, uAccent, vScan * 0.3);
        float a = vAlpha * uFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  portrait = new THREE.Points(geo, mat);
  portrait.frustumCulled = false;
  scene.add(portrait);
  return pos.length / 3;
}

// ---------- environment: floor grid, planned path, dust ----------
function buildEnvironment() {
  // floor grid
  const gp = [];
  const half = 70;
  for (let x = -half; x <= half; x += 5) gp.push(x, FLOOR_Y, 40, x, FLOOR_Y, -TOTAL);
  for (let z = 40; z >= -TOTAL; z -= 10) gp.push(-half, FLOOR_Y, z, half, FLOOR_Y, z);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
  scene.add(new THREE.LineSegments(gGeo, new THREE.LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.06, fog: true })));

  // planned trajectory drawn on the floor
  const tp = [];
  for (let z = -PORTRAIT.far; z >= -END_S - 60; z -= 2) tp.push(pathX(z), FLOOR_Y + 0.02, z);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  scene.add(new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.55, fog: true })));

  // node markers on the floor under each card
  const mp = [];
  for (const c of cards) {
    const x = pathX(c.z), z = c.z, r = 0.9;
    mp.push(x - r, FLOOR_Y + 0.03, z, x + r, FLOOR_Y + 0.03, z, x, FLOOR_Y + 0.03, z - r, x, FLOOR_Y + 0.03, z + r);
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3));
  scene.add(new THREE.LineSegments(mGeo, new THREE.LineBasicMaterial({ color: COLORS.accent, fog: true })));

  // dust: a loose tunnel of points around the trajectory
  const N = innerWidth < 700 ? 500 : 900; // sparse: atmosphere, not clutter
  const dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const z = 30 - Math.random() * TOTAL;
    const a = Math.random() * Math.PI * 2, r = 28 + Math.random() * 100;
    dp[i * 3] = pathX(z) + Math.cos(a) * r;
    dp[i * 3 + 1] = Math.max(FLOOR_Y + 0.5, pathY(z) + Math.sin(a) * r * 0.55);
    dp[i * 3 + 2] = z;
  }
  // each speck is a tiny tile from the same atlas: mostly small, a few large enough to read as you pass
  const dTile = new Float32Array(N), dSize = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    dTile[i] = Math.floor(Math.random() * ATLAS.grid * ATLAS.grid);
    dSize[i] = 0.1 + Math.pow(Math.random(), 5) * 0.9;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  dGeo.setAttribute("aTile", new THREE.BufferAttribute(dTile, 1));
  dGeo.setAttribute("aSize", new THREE.BufferAttribute(dSize, 1));
  const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uPxScale, uMaxPx;
      attribute float aTile, aSize;
      varying float vTile, vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uPxScale / max(dist, 0.001), uMaxPx);
        vTile = aTile;
        vAlpha = (1.0 - smoothstep(40.0, 320.0, dist)) * smoothstep(2.0, 10.0, dist) * 0.55;
      }`,
    fragmentShader: /* glsl */ `
      ${TILE_GLSL}
      varying float vTile, vAlpha;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(tileColor(vTile), vAlpha);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);
}

// ---------- waypoint gates ----------
function gateTexture(sec, si) {
  const c = makeCanvas(2048, 600), g = c.getContext("2d");
  g.textAlign = "center";
  g.fillStyle = COLORS.accent;
  g.font = '500 46px "JetBrains Mono"';
  g.fillText(`WAYPOINT ${pad2(si + 1)} / ${pad2(sections.length)}`, 1024, 100);
  g.fillStyle = COLORS.ink;
  g.font = 'italic 400 270px "Instrument Serif"';
  g.fillText(sec.label, 1024, 350);
  if (sec.intro) {
    g.fillStyle = COLORS.mute;
    g.font = '400 56px "Inter Tight"';
    g.fillText(sec.intro, 1024, 470);
  }
  return texFrom(c);
}
function buildGates() {
  const frameMat = new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.85, fog: true });
  for (const gate of gates) {
    const grp = new THREE.Group();
    grp.position.set(pathX(gate.z), pathY(gate.z), gate.z);
    grp.add(new THREE.LineSegments(bracketGeo(30, 17, 2.6), frameMat));
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16 * (600 / 2048)),
      new THREE.MeshBasicMaterial({ map: gateTexture(gate.sec, gate.si), transparent: true, fog: true, depthWrite: false })
    );
    label.position.y = 0.6;
    grp.add(label);
    const axes = new THREE.AxesHelper(2.2); // a little tf frame, ROS style
    axes.position.set(-15, -8.5, 0);
    grp.add(axes);
    gate.group = grp;
    gate.label = label;
    scene.add(grp);
  }
}

// ---------- cards ----------
// logos and diagrams: shown whole, centred on a dark panel with a faint dot grid
function drawContain(g, img, box) {
  g.fillStyle = "#0b0e10";
  g.fillRect(box.x, box.y, box.w, box.h);
  g.fillStyle = "rgba(233,236,232,0.07)";
  for (let y = box.y + 15; y < box.y + box.h; y += 30) for (let x = box.x + 15; x < box.x + box.w; x += 30) g.fillRect(x - 1, y - 1, 2, 2);
  // fit inside the panel; wide wordmarks are capped at 60% of the width so they don't shout
  const s = Math.min((box.w * 0.6) / img.naturalWidth, (box.h * 0.84) / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  g.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}
// light charts / screenshots → dark: flip lightness but keep hue (white → near-black, black text → white,
// coloured lines keep their colour). Returns a canvas that stands in for the image.
function darkenImage(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = makeCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h), p = id.data;
  for (let i = 0; i < p.length; i += 4) {
    const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]);
    const shift = 255 - mx - mn; // HSL lightness l → 1 − l, same hue
    p[i] = clamp(p[i] + shift + 11, 0, 255); p[i + 1] = clamp(p[i + 1] + shift + 14, 0, 255); p[i + 2] = clamp(p[i + 2] + shift + 16, 0, 255);
  }
  g.putImageData(id, 0, 0);
  c.naturalWidth = w; c.naturalHeight = h;
  return c;
}
// focus: which part survives the crop, 0 = top/left … 0.5 = centre … 1 = bottom/right
// imageCrop: [x, y, w, h] as fractions of the image; returns a canvas standing in for the cropped image
function cropImage(img, [fx, fy, fw, fh]) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = makeCanvas(Math.round(W * fw), Math.round(H * fh));
  c.getContext("2d").drawImage(img, W * fx, H * fy, W * fw, H * fh, 0, 0, c.width, c.height);
  c.naturalWidth = c.width; c.naturalHeight = c.height;
  return c;
}
// tall photos in the wide frame: the photo whole and centred, over a blurred, darkened copy of itself.
// The blur comes from drawing a tiny copy scaled up, which works in every browser (no canvas filters needed).
function drawBlurFit(g, img, box) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const tiny = makeCanvas(32, Math.max(1, Math.round((32 * H) / W)));
  const tg = tiny.getContext("2d");
  tg.imageSmoothingQuality = "high";
  tg.drawImage(img, 0, 0, tiny.width, tiny.height);
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  const s0 = Math.max(box.w / tiny.width, box.h / tiny.height) * 1.15;
  g.drawImage(tiny, box.x + (box.w - tiny.width * s0) / 2, box.y + (box.h - tiny.height * s0) / 2, tiny.width * s0, tiny.height * s0);
  g.fillStyle = "rgba(7,9,11,0.55)";
  g.fillRect(box.x, box.y, box.w, box.h);
  const s = Math.min((box.w * 0.9) / W, box.h / H);
  const w = W * s, h = H * s, x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 40;
  g.drawImage(img, x, y, w, h);
  g.restore();
}
function drawCover(g, img, box, focus = 0.5) {
  const s = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  g.drawImage(img, box.x + (box.w - w) * focus, box.y + (box.h - h) * focus, w, h);
}
function drawPattern(g, box, key) {
  // a generated occupancy grid with a planned path through it
  const r = rng(hash(key));
  g.fillStyle = "#0d1114";
  g.fillRect(box.x, box.y, box.w, box.h);
  const cs = 20, ph = [r() * 6, r() * 6, r() * 6], f = [0.008 + r() * 0.01, 0.012 + r() * 0.012];
  for (let y = box.y; y < box.y + box.h; y += cs) {
    for (let x = box.x; x < box.x + box.w; x += cs) {
      const n = Math.sin(x * f[0] + ph[0]) * Math.cos(y * f[1] + ph[1]) + 0.5 * Math.sin((x + y) * f[1] * 0.7 + ph[2]) + (r() - 0.5) * 0.3;
      if (n > 0.5) { g.fillStyle = `rgba(233,236,232,${0.12 + Math.min(0.32, (n - 0.5) * 0.5)})`; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
      else if (n > 0.2) { g.fillStyle = "rgba(233,236,232,0.04)"; g.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
    }
  }
  const pts = [];
  let py = box.y + box.h * (0.3 + r() * 0.4);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const px = box.x + 70 + ((box.w - 140) * i) / steps;
    if (i) py = clamp(py + (r() - 0.5) * 110, box.y + 60, box.y + box.h - 60);
    pts.push([px, py]);
  }
  g.strokeStyle = COLORS.accent; g.lineWidth = 3;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.fillStyle = COLORS.accent;
  for (const [x, y] of pts) { g.fillRect(x - 4, y - 4, 8, 8); }
  g.strokeStyle = COLORS.accent; g.lineWidth = 2;
  const [ex, ey] = pts[pts.length - 1];
  g.beginPath(); g.arc(ex, ey, 18, 0, Math.PI * 2); g.stroke();
}
// ---------- generated result graphics (item.visual) ----------
// For achievements without a photo: a big result on the left, a small chart of what it means on the right.
function drawVisual(g, box, v, key) {
  const r = rng(hash(key));
  g.fillStyle = "#0b0e10";
  g.fillRect(box.x, box.y, box.w, box.h);
  g.fillStyle = "rgba(233,236,232,0.06)";
  for (let y = box.y + 15; y < box.y + box.h; y += 30) for (let x = box.x + 15; x < box.x + box.w; x += 30) g.fillRect(x - 1, y - 1, 2, 2);

  // left: the result
  const lx = box.x + 64;
  g.textAlign = "left";
  g.fillStyle = COLORS.accent;
  g.font = '500 26px "JetBrains Mono"';
  if (v.label) g.fillText(String(v.label).toUpperCase(), lx, box.y + 108);
  g.fillStyle = COLORS.ink;
  g.font = 'italic 400 210px "Instrument Serif"';
  g.fillText(v.big || "", lx - 6, box.y + 330);
  if (v.note) {
    g.fillStyle = COLORS.mute;
    g.font = '400 32px "Inter Tight"';
    wrapLines(g, v.note, box.w * 0.44, 2).forEach((l, i) => g.fillText(l, lx, box.y + 420 + i * 44));
  }

  // right: the chart
  const R = { x: box.x + box.w * 0.52, y: box.y + 70, w: box.w * 0.42, h: box.h - 140 };
  g.strokeStyle = "rgba(233,236,232,0.18)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(R.x, R.y + R.h); g.lineTo(R.x + R.w, R.y + R.h); g.stroke();

  if (v.kind === "podium") {
    // 2nd · 1st · 3rd blocks, the visitor's place lit, a medal above it
    const order = [2, 1, 3], hts = { 1: 0.78, 2: 0.58, 3: 0.42 }, bw = R.w / 3.3;
    order.forEach((place, i) => {
      const x = R.x + i * (bw + R.w * 0.04) + R.w * 0.02, h = R.h * hts[place], y = R.y + R.h - h, on = place === v.rank;
      g.fillStyle = on ? COLORS.accent : "rgba(233,236,232,0.08)";
      g.fillRect(x, y, bw, h);
      g.strokeStyle = on ? COLORS.accent : "rgba(233,236,232,0.25)"; g.strokeRect(x, y, bw, h);
      g.fillStyle = on ? "#0b0e10" : COLORS.mute;
      g.font = 'italic 400 96px "Instrument Serif"'; g.textAlign = "center";
      g.fillText(String(place), x + bw / 2, y + 100);
      if (on) {
        const mx = x + bw / 2, my = y - 70;
        g.strokeStyle = COLORS.ink; g.lineWidth = 3;
        g.beginPath(); g.moveTo(mx - 22, my - 70); g.lineTo(mx, my - 26); g.lineTo(mx + 22, my - 70); g.stroke();
        g.fillStyle = "#c98a4b"; g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#0b0e10"; g.lineWidth = 3; g.beginPath(); g.arc(mx, my, 24, 0, Math.PI * 2); g.stroke();
      }
    });
    g.textAlign = "left";
  } else if (v.kind === "percentile") {
    // a long-tailed score distribution; the top share shaded in the accent, the visitor marked
    const f = (t) => 0.9 * Math.exp(-Math.pow((t - 0.42) / 0.27, 2)) + 0.12; // wide, with a visible right tail
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push([R.x + t * R.w, R.y + R.h - f(t) * R.h * 0.85]); }
    const cut = 1 - (v.value ?? 0.05);
    g.fillStyle = "rgba(255,106,43,0.14)"; // the top-share zone, full height
    g.fillRect(R.x + cut * R.w, R.y, (1 - cut) * R.w, R.h);
    g.fillStyle = "rgba(122,162,255,0.16)";
    g.beginPath(); g.moveTo(R.x, R.y + R.h); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(R.x + R.w, R.y + R.h); g.fill();
    g.fillStyle = COLORS.accent;
    g.beginPath(); g.moveTo(R.x + cut * R.w, R.y + R.h);
    pts.filter(([x]) => x >= R.x + cut * R.w).forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(R.x + R.w, R.y + R.h); g.fill();
    g.strokeStyle = "#7aa2ff"; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    const mx = R.x + (cut + (1 - cut) * 0.35) * R.w;
    g.strokeStyle = COLORS.ink; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(mx, R.y + 20); g.lineTo(mx, R.y + R.h); g.stroke(); g.setLineDash([]);
    g.fillStyle = COLORS.ink; g.font = '500 26px "JetBrains Mono"'; g.textAlign = "right";
    if (v.marker) g.fillText(v.marker, mx - 14, R.y + 44);
    g.textAlign = "left";
  } else if (v.kind === "clusters") {
    // points in k clusters with centroids, plus a small "choose k" curve with the pick marked
    const k = v.k || 4, cols = ["#7aa2ff", "#c7b6ff", "#e9ece8", COLORS.accent, "#4f6bff"];
    const P = { x: R.x, y: R.y, w: R.w * 0.66, h: R.h };
    const cents = [];
    for (let c = 0; c < k; c++) cents.push([P.x + P.w * (0.18 + 0.64 * r()), P.y + P.h * (0.15 + 0.7 * r())]);
    cents.forEach(([cx, cy], c) => {
      g.fillStyle = cols[c % cols.length];
      for (let n = 0; n < 70; n++) {
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 62;
        g.globalAlpha = 0.85; g.fillRect(cx + Math.cos(a) * d * 1.3 - 3, cy + Math.sin(a) * d - 3, 6, 6);
      }
      g.globalAlpha = 1; g.strokeStyle = COLORS.ink; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 12, cy - 12); g.lineTo(cx + 12, cy + 12); g.moveTo(cx + 12, cy - 12); g.lineTo(cx - 12, cy + 12); g.stroke();
    });
    const E = { x: P.x + P.w + R.w * 0.06, y: R.y + R.h * 0.25, w: R.w * 0.28, h: R.h * 0.6 };
    g.strokeStyle = "rgba(233,236,232,0.3)"; g.lineWidth = 2; g.strokeRect(E.x, E.y, E.w, E.h);
    g.strokeStyle = "#7aa2ff"; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 7; i++) { const x = E.x + 10 + (i / 7) * (E.w - 20), y = E.y + 14 + (1 - Math.exp(-i * 0.9)) * (E.h - 28); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const kx = E.x + 10 + ((k - 1) / 7) * (E.w - 20), ky = E.y + 14 + (1 - Math.exp(-(k - 1) * 0.9)) * (E.h - 28);
    g.fillStyle = COLORS.accent; g.beginPath(); g.arc(kx, ky, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = COLORS.mute; g.font = '400 22px "JetBrains Mono"'; g.textAlign = "center";
    g.fillText("k", E.x + E.w / 2, E.y + E.h + 32); g.textAlign = "left";
  }
}
function cornerMarks(g, b, l) {
  g.beginPath();
  g.moveTo(b.x, b.y + l); g.lineTo(b.x, b.y); g.lineTo(b.x + l, b.y);
  g.moveTo(b.x + b.w - l, b.y); g.lineTo(b.x + b.w, b.y); g.lineTo(b.x + b.w, b.y + l);
  g.moveTo(b.x + b.w, b.y + b.h - l); g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x + b.w - l, b.y + b.h);
  g.moveTo(b.x + l, b.y + b.h); g.lineTo(b.x, b.y + b.h); g.lineTo(b.x, b.y + b.h - l);
  g.stroke();
}
function cardTexture(card, img) {
  const W = 1500, H = 1000, P = 56;
  const c = makeCanvas(W, H), g = c.getContext("2d");
  const { item, sec, ii } = card;
  g.fillStyle = "rgba(11,14,16,0.96)";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(233,236,232,0.16)"; g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);

  const box = { x: P, y: P, w: W - 2 * P, h: 600 };
  g.save();
  g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip();
  const fit = item.imageFit || (img?.isLogo ? "contain" : "cover");
  const src = img && item.imageCrop ? cropImage(img, item.imageCrop) : img;
  if (src) (fit === "contain" ? drawContain : fit === "blur" ? drawBlurFit : drawCover)(g, src, box, item.imageFocus ?? 0.5);
  else if (item.visual) drawVisual(g, box, item.visual, item.title);
  else drawPattern(g, box, item.title + sec.id + ii);
  g.restore();
  g.strokeStyle = COLORS.accent; g.lineWidth = 4;
  cornerMarks(g, box, 34);

  let y = box.y + box.h + 72;
  g.font = '500 28px "JetBrains Mono"';
  g.fillStyle = COLORS.accent;
  g.fillText(`${sec.code}_${pad2(ii + 1)}`, P, y);
  if (item.date) {
    g.textAlign = "right"; g.fillStyle = COLORS.mute;
    g.fillText(String(item.date).toUpperCase(), W - P, y);
    g.textAlign = "left";
  }
  y += 86;
  g.font = 'italic 400 88px "Instrument Serif"'; g.fillStyle = COLORS.ink;
  g.fillText(wrapLines(g, item.title, W - 2 * P, 1)[0] || "", P, y);
  const sub = item.org || item.subtitle;
  y += 56;
  if (sub) {
    g.font = '400 36px "Inter Tight"'; g.fillStyle = COLORS.mute;
    g.fillText(wrapLines(g, sub, W - 2 * P, 1)[0], P, y);
  }
  let x = P;
  g.font = '400 24px "JetBrains Mono"';
  for (const tag of item.tags || []) {
    const w = g.measureText(tag).width + 28;
    if (x + w > W - P) break;
    g.strokeStyle = "rgba(233,236,232,0.22)"; g.lineWidth = 2;
    g.strokeRect(x, 902, w, 44);
    g.fillStyle = COLORS.mute;
    g.fillText(tag, x + 14, 932);
    x += w + 12;
  }
  return texFrom(c);
}
function buildCards(images) {
  const edgeGeo = bracketGeo(CARD_W + 0.35, CARD_H + 0.35, 0.8);
  cards.forEach((card, i) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshBasicMaterial({ map: cardTexture(card, images[i]), transparent: true, fog: true })
    );
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0, fog: true }));
    mesh.add(edge);
    mesh.userData.card = card;
    card.mesh = mesh;
    card.edge = edge;
    card.hover = 0;
    scene.add(mesh);
  });
}

// ---------- responsive layout ----------
let offset = 5.6, view = 15, stops = [];
function layout() {
  const a = innerWidth / innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = a;
  camera.updateProjectionMatrix();

  offset = a >= 1.05 ? 5.6 : a >= 0.8 ? 2.8 : 0;
  // camera turns to face the card at its stop, so fit the card to a share of the viewport width/height
  const widthShare = a < 0.9 ? 0.86 : 0.56;
  view = Math.max(CARD_W / 2 / widthShare / (TAN * a), (CARD_H / 2 / 0.55) / TAN);
  for (const c of cards) {
    if (!c.mesh) continue;
    c.mesh.position.set(pathX(c.z) + c.side * offset, pathY(c.z) + (offset ? c.yOff : 0), c.z);
    c.mesh.rotation.y = offset ? -c.side * 0.2 : 0;
  }
  stops = [{ s: 0 }];
  for (const g of gates) {
    g.s = -g.z - LAYOUT.gateView;
    stops.push({ s: g.s, gate: g });
    for (const c of cards) if (c.si === g.si) { c.s = -c.z - view; stops.push({ s: c.s, card: c }); }
  }
  stops.push({ s: END_S, end: true });

  // portrait: shift right on wide screens (text on the left), up on tall ones (text below), shrink to fit
  const u = portraitUniforms;
  u.uCellPx.value = (PORTRAIT.height * renderer.domElement.height) / portraitRows;
  dustUniforms.uPxScale.value = renderer.domElement.height / (2 * TAN);
  u.uScale.value = Math.min(1, (1.35 * a) / (PORTRAIT.height * portraitAspect)); // phones: shoulders may run off the sides
  u.uShift.value = 0; // centred, with the name running across the bottom
  u.uShiftY.value = a < 0.9 ? 0.1 : 0.0;
  fitName();
}

// ---------- input ----------
let s = 0, target = 0, prevS = 0, lastInput = 0, snapped = true;
let panelOpen = false, indexOpen = false;
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
const ptr = new THREE.Vector2(9, 9);

function input(d) {
  target = clamp(target + d, 0, END_S);
  lastInput = performance.now();
  snapped = false;
}
function flyTo(v) {
  target = clamp(v, 0, END_S);
  lastInput = performance.now();
  snapped = true;
}
function step(dir) {
  if (dir > 0) { const n = stops.find((st) => st.s > target + 2); flyTo(n ? n.s : END_S); }
  else { const p = [...stops].reverse().find((st) => st.s < target - 2); flyTo(p ? p.s : 0); }
}
const nearestStop = (v) => stops.reduce((b, st) => (Math.abs(st.s - v) < Math.abs(b.s - v) ? st : b), stops[0]);

addEventListener("wheel", (e) => {
  if (panelOpen || indexOpen || e.target.closest?.(".panel, .index")) return;
  e.preventDefault();
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= innerHeight;
  input(clamp(d, -240, 240) * 0.075);
}, { passive: false });

addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setNav(false); closePanel(); toggleIndex(false); return; }
  if (panelOpen || indexOpen) return;
  if (["ArrowDown", "PageDown", " ", "ArrowRight"].includes(e.key)) { e.preventDefault(); step(1); }
  else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); step(-1); }
  else if (e.key === "Home") flyTo(0);
  else if (e.key === "End") flyTo(END_S);
});

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, ly: e.clientY, vy: 0, moved: 0, touch: e.pointerType !== "mouse" };
  if (drag.touch) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (e.pointerType === "mouse") { mouse.tx = ptr.x; mouse.ty = ptr.y; }
  if (drag && drag.touch) {
    const dy = drag.ly - e.clientY;
    drag.ly = e.clientY; drag.vy = dy;
    drag.moved += Math.abs(dy);
    input(dy * 0.22);
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const tap = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8;
  if (drag.touch && !tap) input(clamp(drag.vy * 5, -50, 50));
  if (tap) {
    ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const hit = pick();
    if (hit) openPanel(hit);
  }
  drag = null;
});
canvas.addEventListener("pointerleave", () => { ptr.set(9, 9); mouse.tx = 0; mouse.ty = 0; });

const ray = new THREE.Raycaster();
function pick() {
  if (ptr.x > 2) return null;
  ray.setFromCamera(ptr, camera);
  const z = camera.position.z;
  const live = cards.filter((c) => c.mesh && z - c.z > 2 && z - c.z < 140).map((c) => c.mesh);
  const hit = ray.intersectObjects(live, false)[0];
  return hit ? hit.object.userData.card : null;
}

// ---------- detail panel ----------
const panel = $("#panel");
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function openPanel(card) {
  const { item, sec, ii } = card;
  $("#panel-code").textContent = `${sec.code}_${pad2(ii + 1)} · ${sec.label.toUpperCase()}`;
  $("#panel-title").textContent = item.title || "";
  $("#panel-meta").textContent = [item.org || item.subtitle, item.date, item.location].filter(Boolean).join("  ·  ");
  const body = $("#panel-body");
  body.replaceChildren();
  if (!item.image && item.visual) {
    // the same generated graphic as the card, larger
    const vc = makeCanvas(1388, 600);
    drawVisual(vc.getContext("2d"), { x: 0, y: 0, w: 1388, h: 600 }, item.visual, item.title);
    const g = el("div", "gallery"); const im = el("img"); im.src = vc.toDataURL("image/png"); im.alt = ""; g.append(im); body.append(g);
  }
  if (item.image) {
    const g = el("div", "gallery"); const im = el("img"); im.src = item.image; im.alt = item.title || "";
    if (isSvg(item.image) || item.imageFit === "contain") im.className = "logo";
    if (item.imageStyle === "dark") im.classList.add("darkened");
    g.append(im); body.append(g);
  }
  if (item.summary) body.append(el("p", null, item.summary));
  if (item.details?.length) { const ul = el("ul", "details"); item.details.forEach((d) => ul.append(el("li", null, d))); body.append(ul); }
  if (item.tags?.length) { const ul = el("ul", "tags"); item.tags.forEach((t) => ul.append(el("li", null, t))); body.append(ul); }
  if (item.gallery?.length) {
    const g = el("div", "gallery");
    item.gallery.forEach((src) => { const im = el("img"); im.src = src; im.loading = "lazy"; im.alt = ""; g.append(im); });
    body.append(g);
  }
  if (item.links?.length) {
    const ul = el("ul", "links");
    item.links.forEach((l) => {
      // accepts { label, url } or a plain URL string (labelled with its domain)
      const url = typeof l === "string" ? l : l.url;
      let label = typeof l === "string" ? "" : l.label;
      if (!label) { try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { label = "Link"; } }
      const li = el("li"); const a = el("a", null, label + " ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener"; li.append(a); ul.append(li);
    });
    body.append(ul);
  }
  flyTo(card.s);
  panelOpen = true;
  document.body.classList.add("panel-open");
  panel.setAttribute("aria-hidden", "false");
  panel.scrollTop = 0;
  $("#panel-close").focus({ preventScroll: true });
}
function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;
  document.body.classList.remove("panel-open");
  panel.setAttribute("aria-hidden", "true");
}
$("#panel-close").addEventListener("click", closePanel);
$("#scrim").addEventListener("click", closePanel);

// ---------- index overlay ----------
const indexEl = $("#index");
function buildIndex() {
  const inner = $("#index-inner");
  gates.forEach((g) => {
    const col = el("div", "index-sec");
    const h = el("h3");
    const hb = el("button");
    hb.type = "button";
    hb.append(el("span", "num", `WAYPOINT ${pad2(g.si + 1)}`), document.createTextNode(g.sec.label));
    hb.addEventListener("click", () => { toggleIndex(false); flyTo(g.s); });
    h.append(hb);
    col.append(h);
    const ul = el("ul");
    cards.filter((c) => c.si === g.si).forEach((c) => {
      const li = el("li"), b = el("button");
      b.type = "button";
      b.append(el("span", "c", `${c.sec.code}_${pad2(c.ii + 1)}`), el("span", null, c.item.title));
      b.addEventListener("click", () => { toggleIndex(false); flyTo(c.s); });
      li.append(b); ul.append(li);
    });
    col.append(ul);
    inner.append(col);
  });
}
function toggleIndex(force) {
  indexOpen = force ?? !indexOpen;
  indexEl.classList.toggle("open", indexOpen);
  indexEl.setAttribute("aria-hidden", String(!indexOpen));
  $("#index-btn").setAttribute("aria-expanded", String(indexOpen));
  $("#index-btn").textContent = indexOpen ? "Close" : "Index";
}
$("#index-btn").addEventListener("click", () => toggleIndex());
// ---------- top row: navigation, clock, the big name ----------
// collapsed by default: shows the current section; click to unfold a vertical list
const navButtons = [];
const navEl = $(".col-nav"), navToggle = $("#nav-toggle"), navCurrent = $("#nav-current");
function setNav(open) {
  navEl.classList.toggle("open", open);
  navToggle.setAttribute("aria-expanded", String(open));
}
{
  const nav = $("#top-nav");
  const items = [...gates.map((g) => ({ label: g.sec.label, go: () => flyTo(g.s) })), { label: "Contact", go: () => flyTo(END_S) }];
  items.forEach((it, i) => {
    const b = el("button");
    b.type = "button";
    b.append(el("span", "n", pad2(i + 1)), el("span", null, it.label));
    b.addEventListener("click", () => { setNav(false); toggleIndex(false); closePanel(); it.go(); });
    nav.append(b);
    navButtons.push(b);
  });
  const idx = el("button", "nav-index");
  idx.type = "button";
  idx.append(el("span", "n", "↗"), el("span", null, "Index of everything"));
  idx.addEventListener("click", () => { setNav(false); toggleIndex(); });
  nav.append(idx);
  navToggle.addEventListener("click", (e) => { e.stopPropagation(); setNav(!navEl.classList.contains("open")); });
  document.addEventListener("click", (e) => { if (!navEl.contains(e.target)) setNav(false); });
}
const clockEl = $("#clock");
function tickClock() {
  try {
    clockEl.textContent = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: profile.timezone || undefined }).format(new Date());
  } catch { clockEl.textContent = ""; }
}
tickClock();
setInterval(tickClock, 15000);

const bigname = $("#bigname");
bigname.setAttribute("aria-label", profile.name);
// the name spans the full width; on narrow screens it breaks into two balanced lines
function fitName() {
  const words = String(profile.name).split(/\s+/);
  const narrow = innerWidth < 760 && words.length > 1;
  let lines = [words.join(" ")];
  if (narrow) {
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
      const d = Math.abs(a.length - b.length);
      if (!best || d < best.d) best = { d, l: [a, b] };
    }
    lines = best.l;
  }
  bigname.replaceChildren(...lines.map((t) => el("span", null, t)));
  bigname.style.fontSize = "100px";
  const avail = $("#hero").clientWidth;
  const widest = Math.max(...[...bigname.children].map((s) => { s.style.display = "inline-block"; const w = s.getBoundingClientRect().width; s.style.display = ""; return w; }));
  bigname.style.fontSize = `${Math.min(100 * (avail / widest), innerHeight * 0.32)}px`;
}
document.fonts.ready.then(fitName);
$("#home-link").addEventListener("click", (e) => { e.preventDefault(); toggleIndex(false); closePanel(); flyTo(0); });
$("#start-btn").addEventListener("click", () => step(1));
$("#back-btn").addEventListener("click", () => flyTo(0));

// ---------- outro + track ----------
function buildOutro() {
  const about = $("#about-text");
  (profile.about || []).forEach((p) => about.append(el("p", null, p)));
  const email = $("#email-link");
  if (profile.email) { email.textContent = profile.email; email.href = `mailto:${profile.email}`; } else email.remove();
  const ul = $("#outro-links");
  (profile.links || []).forEach((l) => { const li = el("li"); const a = el("a", null, l.label); a.href = l.url; a.target = "_blank"; a.rel = "noopener"; li.append(a); ul.append(li); });
}
const track = $("#track"), trackFill = $("#track-fill");
const ticks = [];
function buildTrack() {
  const marks = [...gates.map((g) => ({ label: g.sec.label, get s() { return g.s; } })), { label: "Contact", s: END_S }];
  for (const [i, m] of marks.entries()) {
    const b = el("button", "track-tick");
    b.type = "button";
    const lab = el("span");
    lab.append(el("i", null, pad2(i + 1)), el("em", null, " " + m.label));
    b.append(lab);
    b.setAttribute("aria-label", `Go to ${m.label}`);
    b.addEventListener("click", () => { toggleIndex(false); flyTo(m.s); });
    track.append(b);
    ticks.push({ b, m });
  }
}
function placeTicks() { for (const { b, m } of ticks) b.style.left = `${(m.s / END_S) * 100}%`; }

// ---------- frame loop ----------
const hero = $("#hero"), outro = $("#outro"), telemetry = $("#telemetry"), hint = $("#hint");
const look = new THREE.Vector3();
const clock = new THREE.Clock();
let introStart = 0, frame = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  frame++;

  // settle on the nearest stop after the visitor stops scrolling
  if (!snapped && !drag && now - lastInput > 650) {
    const st = nearestStop(target);
    if (Math.abs(st.s - target) < 30) target = st.s;
    snapped = true;
  }
  s = lerp(s, target, 1 - Math.exp(-dt * (reduced ? 9 : 3.4)));
  if (Math.abs(target - s) < 0.01) s = target;
  const vel = (s - prevS) / Math.max(dt, 1e-4);
  prevS = s;

  mouse.x = lerp(mouse.x, mouse.tx, 1 - Math.exp(-dt * 3));
  mouse.y = lerp(mouse.y, mouse.ty, 1 - Math.exp(-dt * 3));

  // camera along the trajectory, turning toward the card being passed
  const z = -s;
  const par = reduced ? 0 : 0.9;
  // a slow idle drift, so the depth in the portrait shows even when nobody touches the mouse
  const tt = now / 1000, drift = reduced ? 0 : 0.28;
  camera.position.set(
    pathX(z) + mouse.x * par + Math.sin(tt * 0.31) * drift,
    pathY(z) + mouse.y * par * 0.6 + Math.sin(tt * 0.23 + 1.7) * drift * 0.6,
    z
  );
  let best = 0, focus = null;
  for (const c of cards) {
    if (!c.mesh) continue;
    const w = 1 - smooth(0, 34, Math.abs(z - (c.z + view)));
    if (w > best) { best = w; focus = c.mesh.position; }
  }
  const la = z - 40;
  look.set(pathX(la), pathY(la), la);
  if (focus) look.lerp(focus, best * 0.8);
  camera.lookAt(look);
  camera.fov = FOV + (reduced ? 0 : clamp(Math.abs(vel) * 0.025, 0, 9));
  camera.updateProjectionMatrix();

  // portrait
  if (portrait) {
    const u = portraitUniforms;
    u.uIntro.value = introStart ? clamp((now - introStart) / (reduced ? 1 : 2600), 0, 1) : 0;
    u.uScan.value = 1.3 - (((now / 1000) * 0.22) % 1) * 2.6;
    // the portrait scatters as you fly in, then clears away before the first waypoint
    u.uFade.value = 1 - smooth(150, 380, s);
    portrait.visible = u.uFade.value > 0.001;
  }

  // gates and cards: fade near the camera
  for (const g of gates) {
    const dz = z - g.z;
    g.group.visible = dz > -2 && dz < 520;
    g.label.material.opacity = smooth(3, 16, dz);
  }
  const hovered = !panelOpen && !indexOpen && !drag ? pick() : null;
  canvas.classList.toggle("hot", !!hovered);
  hint.classList.toggle("on", !!hovered);
  for (const c of cards) {
    if (!c.mesh) continue;
    const dz = z - c.z;
    c.mesh.visible = dz > -2 && dz < 520;
    c.mesh.material.opacity = offset === 0 ? smooth(1.5, 7, dz) : smooth(-1, 3, dz);
    c.hover = lerp(c.hover, c === hovered ? 1 : 0, 1 - Math.exp(-dt * 10));
    c.mesh.scale.setScalar(1 + c.hover * 0.03);
    c.edge.material.opacity = c.hover;
  }

  // DOM overlays
  const h = 1 - smooth(0, 90, s);
  hero.style.opacity = h;
  hero.style.transform = `translateY(${(1 - h) * 140}px)`; // the name slides down and away as you fly in
  hero.style.visibility = h < 0.01 ? "hidden" : "";
  telemetry.style.opacity = track.style.opacity = 1 - h; // flight instruments come up as the name leaves
  track.style.pointerEvents = h > 0.5 ? "none" : "";
  const o = smooth(END_S - 80, END_S - 8, s);
  outro.style.opacity = o;
  outro.classList.toggle("on", o > 0.6);
  trackFill.style.width = `${(s / END_S) * 100}%`;

  if (frame % 4 === 0) {
    let si = -1;
    gates.forEach((g, i) => { if (s >= g.s - 40) si = i; });
    ticks.forEach(({ b }, i) => b.classList.toggle("active", i === si || (i === ticks.length - 1 && o > 0.6)));
    const navActive = o > 0.6 ? gates.length : si;
    navButtons.forEach((b, i) => b.classList.toggle("active", i === navActive));
    const label = navActive < 0 ? "Menu" : navActive === gates.length ? "Contact" : gates[navActive].sec.label;
    if (navCurrent.textContent !== label) navCurrent.textContent = label;
    const node = stops.find((st) => st.card && Math.abs(st.s - s) < 12)?.card;
    const p = camera.position;
    const f = (v, n = 1) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(n).padStart(6, "0");
    telemetry.innerHTML =
      `POS  <b>x ${f(p.x, 2)}  z ${f(p.z)}</b>\n` +
      `VEL  <b>${Math.abs(vel).toFixed(1).padStart(5, "0")} u/s</b>\n` +
      `WP   <b>${si < 0 ? "00" : pad2(si + 1)}/${pad2(gates.length)}  ${si < 0 ? "ORIGIN" : gates[si].sec.label.toUpperCase()}</b>\n` +
      `NODE <i>${node ? `${node.sec.code}_${pad2(node.ii + 1)}` : "—"}</i>`;
  }

  renderer.render(scene, camera);
}

// ---------- boot ----------
async function init() {
  const fontLoad = Promise.all([
    document.fonts.load('italic 400 88px "Instrument Serif"'),
    document.fonts.load('500 72px "Inter Tight"'),
    document.fonts.load('400 36px "Inter Tight"'),
    document.fonts.load('500 28px "JetBrains Mono"'),
    document.fonts.load('400 24px "JetBrains Mono"'),
  ]);
  await Promise.race([fontLoad, new Promise((r) => setTimeout(r, 3000))]);
  log("[ ok ] fonts");

  const [face, ...images] = await Promise.all([loadImage(profile.portrait), ...cards.map((c) => loadImage(c.item.image))]);
  images.forEach((im, i) => { if (im && cards[i].item.imageStyle === "dark") images[i] = darkenImage(im); });
  // atlas photos: every card image you've added (more images = more variety in the tiles)
  // logos and other "shown whole" images don't crop into good tiles
  const photos = images.filter((im, i) => im && !im.isLogo && cards[i].item.imageFit !== "contain");
  const tiles = buildAtlas(photos);
  dustUniforms.uAtlas.value = atlasTexture;
  dustUniforms.uMaxPx.value = maxPointPx();
  log(`[ ok ] tile atlas — ${tiles} tiles from ${photos.length} photo(s) + generated`);
  const n = buildPortrait(face);
  log(`[ ok ] point cloud — ${n.toLocaleString()} pts${face ? "" : " (placeholder portrait)"}`);

  buildEnvironment();
  buildGates();
  buildCards(images);
  log(`[ ok ] waypoints — ${gates.length} sections / ${cards.length} nodes`);
  buildIndex();
  buildOutro();
  buildTrack();
  layout();
  placeTicks();
  addEventListener("resize", () => { layout(); placeTicks(); });
  log("[ ok ] trajectory armed");

  const startAt = new URLSearchParams(location.search).get("s"); // ?s=600 starts partway along (handy for testing)
  if (startAt) s = target = prevS = clamp(+startAt || 0, 0, END_S);

  tick();
  if (new URLSearchParams(location.search).has("shot")) $("#boot").remove(); // ?shot: skip the boot screen (screenshots)
  if (new URLSearchParams(location.search).has("navopen")) setNav(true); // ?navopen: menu unfolded (screenshots)
  setTimeout(() => {
    $("#boot")?.classList.add("done");
    introStart = performance.now();
  }, reduced ? 0 : 350);
}

init().catch((err) => {
  console.error(err);
  log("[fail] " + err.message);
});
