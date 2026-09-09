import { useEffect, useState } from 'react';

const COLORS = ['#81b64c', '#f7c631', '#6b9dc2', '#e0806f', '#26c2a3', '#ffa459'];

/** A short celebratory burst (pure CSS, no library). Mount it when something good happens. */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const [pieces] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      left: 8 + Math.random() * 84,
      delay: Math.random() * 0.25,
      dur: 0.9 + Math.random() * 0.6,
      color: COLORS[i % COLORS.length],
      rot: Math.random() * 360,
      w: 6 + Math.random() * 6,
    }))
  );
  useEffect(() => {
    const t = window.setTimeout(() => onDone?.(), 1600);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.w,
            height: p.w * 0.6,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
