// Dependency-free SVG charts for the dashboard.
import { money } from "../api";

export function LineChart({ data, x = "date", y = "total", height = 180, format = money }) {
  const w = 600;
  const h = height;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d[y]));
  const px = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const py = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(d[y]).toFixed(1)}`).join(" ");
  const area = `${path} L${px(data.length - 1).toFixed(1)},${(h - pad.b).toFixed(1)} L${pad.l},${(h - pad.b).toFixed(1)} Z`;
  const ticks = [0, Math.floor(data.length / 2), data.length - 1].filter((i, k, a) => a.indexOf(i) === k && data[i]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Revenue over time">
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#029494" stopOpacity="0.28" /><stop offset="1" stopColor="#029494" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={area} fill="url(#fill)" />
      <path d={path} fill="none" stroke="#029494" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => d[y] > 0 && <circle key={i} cx={px(i)} cy={py(d[y])} r="3.5" fill="#029494"><title>{`${d[x]}: ${format(d[y])}`}</title></circle>)}
      {ticks.map((i) => <text key={i} x={px(i)} y={h - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="chart__tick">{data[i][x].slice(5)}</text>)}
      <text x={w - pad.r} y={pad.t + 4} textAnchor="end" className="chart__tick">{format(max)}</text>
    </svg>
  );
}

export function Bars({ data, label = "category", value = "revenue", format = money }) {
  const max = Math.max(1, ...data.map((d) => d[value]));
  if (!data.length) return <p className="muted small">No sales yet.</p>;
  return (
    <ul className="bars">
      {data.map((d) => (
        <li key={d[label]}>
          <span className="bars__label">{d[label]}</span>
          <span className="bars__track"><span className="bars__fill" style={{ width: `${(d[value] / max) * 100}%` }} /></span>
          <span className="bars__value">{format(d[value])}</span>
        </li>
      ))}
    </ul>
  );
}
