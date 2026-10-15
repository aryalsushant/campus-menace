import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { setGame, getGame } from '../game/core/store';

const norm = s =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// each row: { id, name, city, state, hay, words, aliases }
let index = null;
async function loadIndex() {
  if (index) return index;
  const list = await api.universities();
  index = list.map(([id, name, city, state, alias]) => {
    const n = norm(name);
    return {
      id,
      name,
      city,
      state,
      n,
      hay: ` ${n} ${norm(alias)} ${norm(city)} ${state.toLowerCase()} `,
      aliases: alias ? alias.split(/[,/;]/).map(norm).filter(Boolean) : [],
    };
  });
  return index;
}

export function searchUniversities(rows, query, limit = 40) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits = [];
  for (const u of rows) {
    if (!words.every(w => u.hay.includes(` ${w}`))) continue;
    // nicknames (UCLA, Ole Miss) first, then names that start with the query
    const score = u.aliases.includes(q) ? 0 : u.n.startsWith(q) ? 1 : u.n.includes(` ${q}`) || u.n.includes(q) ? 2 : 3;
    hits.push([score, u]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  return hits.slice(0, limit).map(h => h[1]);
}

export const place = u => `${u.city}, ${u.state}`;

// A searchable dropdown of every US university.
export function UniversityPicker({ value, onPick, autoFocus, label = 'Search for your university' }) {
  const [rows, setRows] = useState(index);
  const [err, setErr] = useState('');
  const [text, setText] = useState(value ? value.name : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef(null);
  const id = useId();
  useEffect(() => {
    if (rows) return undefined;
    let live = true;
    loadIndex()
      .then(r => live && setRows(r))
      .catch(x => live && setErr(x.message));
    return () => {
      live = false;
    };
  }, [rows]);
  const results = useMemo(() => (rows ? searchUniversities(rows, text) : []), [rows, text]);
  useEffect(() => setActive(0), [text]);
  useEffect(() => {
    const el = list.current && list.current.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const pick = u => {
    setText(u.name);
    setOpen(false);
    onPick({ id: u.id, name: u.name, city: u.city, state: u.state });
  };
  const key = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    }
  };
  const showList = open && text && (!value || text !== value.name);
  return (
    <div className="cm-uni">
      <input
        role="combobox"
        aria-expanded={!!showList}
        aria-controls={`${id}-list`}
        aria-activedescendant={showList && results[active] ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label={label}
        placeholder={rows || err ? 'Type your school’s name' : 'Loading schools…'}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setOpen(true);
          if (value) onPick(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={key}
      />
      {showList && (
        <ul className="cm-uni-list" role="listbox" id={`${id}-list`} ref={list}>
          {!rows && !err && <li className="cm-uni-empty">Loading…</li>}
          {rows && results.length === 0 && <li className="cm-uni-empty">No US schools match “{text}”.</li>}
          {results.map((u, i) => (
            <li
              key={u.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(u)}
            >
              <b>{u.name}</b>
              <small>{place(u)}</small>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="cm-error">{err}</p>}
    </div>
  );
}

// Saves (or with null, clears) the player's university.
export async function saveUniversity(u) {
  await api.setUniversity(u ? u.id : null);
  setGame(g => ({ profile: g.profile && { ...g.profile, university: u } }));
  markUniversityAsked();
}

// The picker shows once after the first sign-in, picked or skipped.
export function needsUniversity(g = getGame()) {
  if (!g.profile || g.profile.university || g.universityAsked) return false;
  const meta = g.session && g.session.user && g.session.user.user_metadata;
  return !(meta && meta.university_asked);
}

export function markUniversityAsked() {
  if (getGame().universityAsked) return;
  setGame({ universityAsked: true });
  api.markUniversityAsked().catch(() => {});
}
