"use client";

type Props = { total: number; completed: number; size?: number };

export default function ProgressRing({ total, completed, size = 32 }: Props) {
  if (total === 0) return null;
  const pct = completed / total;
  const done = pct === 1;
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
        strokeWidth={2} className="text-border" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={done ? "#22c55e" : "currentColor"}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className={done ? "" : "text-foreground"}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text
        x={size / 2} y={size / 2}
        dominantBaseline="middle" textAnchor="middle"
        fontSize={size * 0.28} fill="currentColor"
        className="rotate-90 origin-center text-foreground"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}
      >
        {completed}/{total}
      </text>
    </svg>
  );
}
