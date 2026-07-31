import { useState } from 'react';
import {
  loadWeakness,
  clearWeakness,
  topThemes,
  worstPhase,
  type WeaknessData,
} from '../review/weakness';

const PHASE_LABEL: Record<string, string> = {
  opening: 'the opening',
  middlegame: 'the middlegame',
  endgame: 'the endgame',
};

/**
 * "Your recurring weaknesses" — aggregate patterns across every game you've
 * reviewed on this device. Reads the localStorage tally; shows nothing until
 * at least one game has been reviewed.
 */
export function Weakness() {
  const [data, setData] = useState<WeaknessData>(() => loadWeakness());

  if (data.games === 0 || data.mistakes === 0) return null;

  const themes = topThemes(data, 3);
  const phase = worstPhase(data);
  const mistakeRate = data.moves ? Math.round((data.mistakes / data.moves) * 100) : 0;
  const max = themes[0]?.count ?? 1;

  const reset = () => {
    clearWeakness();
    setData(loadWeakness());
  };

  return (
    <div className="card weakness">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Your recurring weaknesses</h3>
        <button onClick={reset} title="Clear the saved tally">Reset</button>
      </div>
      <p className="note" style={{ marginTop: 4 }}>
        Across {data.games} reviewed game{data.games === 1 ? '' : 's'} · {data.mistakes} mistakes
        ({mistakeRate}% of moves){data.blunders ? ` · ${data.blunders} blunders` : ''}.
      </p>

      <div className="weakness-bars">
        {themes.map((t) => (
          <div className="weakness-row" key={t.id}>
            <span className="weakness-label">{t.label}</span>
            <span className="weakness-track">
              <span
                className="weakness-fill"
                style={{ width: `${Math.max(8, Math.round((t.count / max) * 100))}%` }}
              />
            </span>
            <span className="weakness-count">{t.count}</span>
          </div>
        ))}
      </div>

      {phase && (
        <p className="note" style={{ marginTop: 8 }}>
          Most of your mistakes happen in <strong>{PHASE_LABEL[phase.phase]}</strong> ({phase.count}).
          Slow down there.
        </p>
      )}
    </div>
  );
}
