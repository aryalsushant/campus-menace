// Catches common typos in the domain of an email address (gmial.com,
// yahoo.con) and suggests the likely intended one.
const DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'comcast.net', 'att.net', 'verizon.net', 'ymail.com', 'googlemail.com'];
// real providers that sit close to the ones above
const KNOWN = new Set([...DOMAINS, 'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'zoho.com', 'hey.com', 'fastmail.com', 'aim.com', 'duck.com', 'rocketmail.com', 'sbcglobal.net', 'bellsouth.net', 'charter.net', 'cox.net', 'earthlink.net', 'yandex.com', 'qq.com', 'tutanota.com', 'live.co.uk', 'yahoo.co.uk']);

// edit distance with adjacent swaps (Damerau-Levenshtein, optimal string alignment)
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

export function suggestEmail(email) {
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(email.trim().toLowerCase());
  if (!m) return null;
  const [, user, domain] = m;
  if (KNOWN.has(domain) || domain.endsWith('.edu')) return null;
  let best = null;
  let bestD = 3;
  for (const d of DOMAINS) {
    const k = distance(domain, d);
    if (k < bestD) (best = d), (bestD = k);
  }
  // short domains need a closer match so me.com doesn't swallow everything
  if (!best || bestD > (domain.length <= 6 ? 1 : 2)) return null;
  return `${user}@${best}`;
}
