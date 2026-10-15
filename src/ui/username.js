import { useEffect, useMemo, useRef, useState } from 'react';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { api } from '../lib/api';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'support', 'campusmenace', 'campus_menace', 'official', 'staff', 'system', 'root', 'null', 'undefined'];

export function usernameProblem(name) {
  if (!name) return 'Pick a username.';
  if (!/^[A-Za-z0-9_]*$/.test(name)) return 'Letters, numbers and underscores only.';
  if (name.length < 3) return 'At least 3 characters.';
  if (name.length > 16) return 'At most 16 characters.';
  if (matcher.hasMatch(name.replace(/_/g, ' ')) || matcher.hasMatch(name)) return 'Pick something friendlier.';
  if (RESERVED.includes(name.toLowerCase())) return 'That username is reserved.';
  return '';
}

// Live format + availability check for a username field. `own` is the
// player's current name: a different capitalisation of it is allowed.
export function useUsernameCheck(name, own = '') {
  const [remote, setRemote] = useState({ checking: false, available: null, msg: '' });
  const seq = useRef(0);
  const local = useMemo(() => (name ? usernameProblem(name) : ''), [name]);
  const mine = !!own && name.toLowerCase() === own.toLowerCase();
  useEffect(() => {
    if (!name || local || mine) {
      seq.current++;
      setRemote({ checking: false, available: mine ? name !== own : null, msg: mine && name !== own ? 'Available' : '' });
      return undefined;
    }
    const id = ++seq.current;
    setRemote(s => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try {
        const ok = await api.usernameAvailable(name);
        if (id === seq.current) setRemote({ checking: false, available: ok, msg: ok ? 'Available' : 'Taken' });
      } catch (x) {
        if (id === seq.current) setRemote({ checking: false, available: null, msg: x.message });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name, local, mine, own]);
  const bad = !!local || (!mine && remote.available === false);
  return {
    bad,
    good: !bad && remote.available === true,
    checking: remote.checking,
    problem: usernameProblem(name) || (name === own ? 'That’s already your username.' : remote.available === false ? 'That username is taken.' : ''),
    text: local || (remote.checking ? 'Checking…' : remote.msg),
  };
}
