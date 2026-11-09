import { memo } from "react";

// Watercolor honeycomb at the frame edges (D1 design pass). Pure SVG, no image files, deterministic (no hydration drift).
// Art only at the edges and corners; the centre stays clear so text and chips sit on plain paper or solid plates.
const W = 1376;
const H = 768;
const PALETTE = ["#f3d98a", "#f0c95c", "#e4a92a", "#d99a14", "#cdb6e6", "#b9a0dc", "#f6e8b4"];

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

type Cell = { x: number; y: number; fill: string; o: number };

// A cluster of hexagons on a pointy-top grid around (cx, cy); `rings` controls how many neighbours are kept.
function cluster(cx: number, cy: number, radius: number, size: number, seed: number): Cell[] {
  const r = rng(seed);
  const cells: Cell[] = [];
  const dx = size * Math.sqrt(3);
  const dy = size * 1.5;
  for (let row = -6; row <= 6; row++) {
    for (let col = -6; col <= 6; col++) {
      const x = cx + col * dx + (row % 2 ? dx / 2 : 0);
      const y = cy + row * dy;
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius * (0.75 + r() * 0.35)) continue; // ragged edge
      cells.push({ x, y, fill: PALETTE[Math.floor(r() * PALETTE.length)], o: 0.45 + r() * 0.3 });
    }
  }
  return cells;
}

function hexPoints(x: number, y: number, s: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const CLUSTERS = [
  { cx: 50, cy: 330, radius: 150, size: 36, seed: 11 },
  { cx: 1310, cy: 300, radius: 160, size: 36, seed: 23 },
  { cx: 980, cy: 30, radius: 120, size: 34, seed: 37 },
  { cx: 110, cy: 710, radius: 120, size: 32, seed: 41 },
  { cx: 1290, cy: 710, radius: 130, size: 34, seed: 53 },
];

const DRIPS = [
  { x: 36, w: 26, len: 70 },
  { x: 150, w: 20, len: 38 },
  { x: 740, w: 28, len: 84 },
  { x: 1010, w: 22, len: 44 },
  { x: 1318, w: 26, len: 66 },
];

function Bee({ x, y, scale = 1, flip = false }: { x: number; y: number; scale?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <ellipse cx="-4" cy="-12" rx="9" ry="6" fill="#fff" opacity=".85" transform="rotate(-25 -4 -12)" />
      <ellipse cx="6" cy="-13" rx="9" ry="6" fill="#fff" opacity=".85" transform="rotate(20 6 -13)" />
      <ellipse cx="0" cy="0" rx="14" ry="10" fill="#f0b323" />
      <path d="M-4 -9v18M3 -9.5v19" stroke="#3a2a18" strokeWidth="4" strokeLinecap="round" />
      <circle cx="-13" cy="-1" r="5" fill="#3a2a18" />
    </g>
  );
}

function Candle({ x, y, h = 38 }: { x: number; y: number; h?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 -${h + 16} c5 8 5 12 0 15 c-5 -3 -5 -7 0 -15z`} fill="#f5a623" opacity=".9" />
      <rect x="-11" y={-h} width="22" height={h} rx="4" fill="#f2cf8a" />
      <rect x="-11" y={-h} width="22" height="7" rx="3" fill="#f8e3b0" />
      <rect x="-14" y="-3" width="28" height="6" rx="3" fill="#d9b672" />
    </g>
  );
}

export const Backdrop = memo(function Backdrop() {
  return (
    <svg className="backdrop" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <filter id="wc" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id="wash"><feGaussianBlur stdDeviation="22" /></filter>
        <linearGradient id="drip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0c95c" />
          <stop offset="1" stopColor="#f6dc93" />
        </linearGradient>
      </defs>

      {/* soft washes behind the clusters */}
      <g filter="url(#wash)" opacity=".5">
        <ellipse cx="90" cy="380" rx="180" ry="210" fill="#cdb6e6" />
        <ellipse cx="1300" cy="340" rx="190" ry="220" fill="#f0c95c" />
        <ellipse cx="1240" cy="700" rx="200" ry="120" fill="#cdb6e6" />
        <ellipse cx="160" cy="720" rx="180" ry="100" fill="#f0c95c" />
      </g>

      <g filter="url(#wc)">
        {CLUSTERS.map((c) =>
          cluster(c.cx, c.cy, c.radius, c.size, c.seed).map((h, i) => (
            <polygon key={`${c.seed}-${i}`} points={hexPoints(h.x, h.y, c.size * 0.94)} fill={h.fill} opacity={h.o} stroke="#fff8e6" strokeWidth="2.2" />
          )),
        )}
        {/* honey drip along the top edge */}
        <rect x="-10" y="-10" width={W + 20} height="34" fill="url(#drip)" opacity=".92" />
        {DRIPS.map((d) => (
          <path key={d.x} d={`M${d.x} 10h${d.w}v${d.len}a${d.w / 2} ${d.w / 2} 0 0 1 -${d.w} 0z`} fill="url(#drip)" opacity=".92" />
        ))}
      </g>

      <Candle x={70} y={560} />
      <Candle x={320} y={720} h={30} />
      <Candle x={1160} y={250} h={40} />
      <Candle x={1260} y={620} h={34} />
      <Bee x={300} y={190} scale={1.15} />
      <Bee x={1085} y={185} scale={1.1} flip />
      <Bee x={160} y={560} scale={1} />
      <Bee x={1190} y={520} scale={1.05} />
      <Bee x={1245} y={540} scale={.9} flip />
    </svg>
  );
});
