import { useEffect, useRef, useState } from 'react';
import { THEMES, setBoardSettings, useBoardSettings, type ThemeKey } from './boardSettings';

/** A gear popover for board appearance: theme swatches + a coordinates toggle. */
export function BoardSettingsMenu() {
  const s = useBoardSettings();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="settings-wrap" ref={wrap}>
      <button onClick={() => setOpen((o) => !o)} title="Board appearance" className={open ? 'active' : ''}>
        ⚙️
      </button>
      {open && (
        <div className="settings-pop">
          <div className="settings-label">Board theme</div>
          <div className="theme-swatches">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                className={`swatch ${s.theme === k ? 'active' : ''}`}
                onClick={() => setBoardSettings({ theme: k })}
                title={THEMES[k].name}
                aria-label={THEMES[k].name}
              >
                <span style={{ background: THEMES[k].dark }} />
                <span style={{ background: THEMES[k].light }} />
              </button>
            ))}
          </div>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={s.coords}
              onChange={(e) => setBoardSettings({ coords: e.target.checked })}
            />
            Show coordinates
          </label>
        </div>
      )}
    </div>
  );
}
