import { useEffect, useState } from 'react';
import { offlineSupported, isOfflineReady, downloadForOffline } from './offline';

type State = 'checking' | 'idle' | 'downloading' | 'ready' | 'unsupported';

/**
 * Header control that shows offline status and lets the user explicitly
 * download the app for offline use — "save it and play forever with no
 * internet."
 */
export function OfflineButton() {
  const [state, setState] = useState<State>('checking');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!offlineSupported()) {
      setState('unsupported');
      return;
    }
    let alive = true;
    // The service worker precaches in the background on first visit, so keep
    // checking until everything's cached (or the user triggers it manually).
    const poll = async (left: number) => {
      if (!alive) return;
      if (await isOfflineReady()) {
        if (alive) setState('ready');
        return;
      }
      if (!alive) return;
      setState((s) => (s === 'downloading' || s === 'ready' ? s : 'idle'));
      if (left > 0) setTimeout(() => poll(left - 1), 2000);
    };
    void poll(20);
    return () => {
      alive = false;
    };
  }, []);

  const download = async () => {
    setState('downloading');
    setPct(0);
    const ok = await downloadForOffline(setPct);
    setState(ok ? 'ready' : 'idle');
  };

  if (state === 'unsupported' || state === 'checking') return null;

  if (state === 'ready') {
    return (
      <button className="offline-ready" title="Saved — works with no internet" disabled>
        ✓ Offline ready
      </button>
    );
  }
  if (state === 'downloading') {
    return (
      <button disabled title="Downloading the engine for offline use">
        ⬇ Saving… {pct}%
      </button>
    );
  }
  return (
    <button onClick={download} title="Download the engine (~40 MB) so it works with no internet">
      ⬇ Save offline
    </button>
  );
}
