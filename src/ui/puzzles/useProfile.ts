import { useCallback, useRef, useState } from 'react';
import { loadProfile, saveProfile, type Profile } from '../../puzzles/profile';

/**
 * The puzzle profile, held in a ref and mutated in place. Mutations run
 * outside React's state updaters on purpose: StrictMode calls updaters twice,
 * which would record every puzzle twice.
 */
export function useProfile() {
  const ref = useRef<Profile | null>(null);
  if (ref.current === null) ref.current = loadProfile();
  const [version, setVersion] = useState(0);
  const mutate = useCallback(<T,>(fn: (p: Profile) => T): T => {
    const out = fn(ref.current!);
    saveProfile(ref.current!);
    setVersion((v) => v + 1);
    return out;
  }, []);
  return { profile: ref.current, mutate, version };
}

export type Mutate = ReturnType<typeof useProfile>['mutate'];
