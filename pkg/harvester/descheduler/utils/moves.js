/**
 * How many VMs move along each node-to-node route, biggest first (ties by name so the order is stable). A move with no known
 * destination (nodeFit off) is counted under '?'.
 */
export function routeCounts(evictions) {
  const counts = new Map();

  for (const e of evictions) {
    const to = e.to || '?';
    const key = `${ e.from }\u0000${ to }`;
    const c = counts.get(key) || {
      from: e.from, to, count: 0
    };

    c.count++;
    counts.set(key, c);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}
/** The first `n` entries of a list and how many were left out, so a long list can end in "and N more". */
export function head(list, n) {
  const shown = list.slice(0, Math.max(n, 0));

  return { shown, more: list.length - shown.length };
}
/** Counts of items per key, in the order the keys first appear (used for "3 descheduler, 9 evacuation, 1 manual"). */
export function countBy(list, key) {
  const counts = new Map();

  for (const item of list) {
    counts.set(key(item), (counts.get(key(item)) || 0) + 1);
  }

  return [...counts.entries()].map(([k, count]) => ({ key: k, count }));
}
