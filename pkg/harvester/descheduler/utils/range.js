import { isLauncher, simulate, sortKey } from './simulate';
import { isActivePod, podRequests } from './utilization';
const keyOf = (e) => `${ e.namespace }/${ e.pod }`;
const podKey = (p) => `${ p?.metadata?.namespace }/${ p?.metadata?.name }`;

export function simulateRange(nodes, pods, t, opts, budget = 200) {
  let runs = 0;
  let truncated = false;
  const outcomes = new Map();
  const seen = new Set();
  const byKey = new Map(pods.map((p) => [podKey(p), p]));
  const run = (order) => {
    runs++;

    return simulate(nodes, pods, t, { ...opts, order }).evictions;
  };
  const record = (evictions) => outcomes.set(evictions.map(keyOf).sort().join('|'), evictions);
  const first = run([]);

  record(first);
  if (first.length === 0) {
    return {
      min: 0, max: 0, exact: true, runs, outcomes: 1, possible: {}, certain: [], sets: ['']
    };
  }
  // The two extremes first, so that even a cut-short search has sensible bounds.
  const alloc = new Map(nodes.map((n) => [n?.metadata?.name, n?.status?.allocatable]));
  const size = (p) => {
    const r = podRequests(p);
    const a = alloc.get(p?.spec?.nodeName) || {};
    const frac = (v, total) => (Number(total) > 0 ? v / Number(total) : 0);

    return frac(r.cpu, a.cpu) + frac(r.memory, a.memory);
  };
  const launchers = pods.filter((p) => isActivePod(p) && isLauncher(p)).sort((a, b) => size(a) - size(b));

  record(run(launchers.map(podKey)));
  record(run(launchers.map(podKey).reverse()));
  // Everything that could have been tried instead of `head` at that point: the same node, the same priority and QoS.
  const tie = (head, taken) => pods.filter((p) => p?.spec?.nodeName === head?.spec?.nodeName && isActivePod(p) && isLauncher(p) &&
        !(opts.excluded || []).includes(p?.metadata?.namespace) && !taken.has(podKey(p)) && sortKey(p).join() === sortKey(head).join());
  const explore = (prefix) => {
    // What can still happen depends only on WHICH VMs were evicted so far (they decide the room left), not on their order, so two
    // orders that reach the same set are explored once.
    const id = [...prefix].sort().join('|');

    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    if (runs >= budget) {
      truncated = true;

      return;
    }
    const evictions = run(prefix);

    record(evictions);
    const order = evictions.map(keyOf);

    for (let d = prefix.length; d < order.length; d++) {
      const head = byKey.get(order[d]);
      const taken = new Set(order.slice(0, d));

      for (const alt of tie(head, taken)) {
        if (podKey(alt) !== order[d]) {
          explore([...order.slice(0, d), podKey(alt)]);
        }
      }
    }
  };

  explore([]);
  const all = [...outcomes.values()];
  const sizes = all.map((o) => o.length);
  const possible = {};
  const counts = new Map();

  for (const o of all) {
    for (const e of o) {
      possible[e.from] = possible[e.from] || [];
      if (!possible[e.from].includes(e.vm)) {
        possible[e.from].push(e.vm);
      }
      counts.set(e.vm, (counts.get(e.vm) || 0) + 1);
    }
  }

  return {
    min:      Math.min(...sizes),
    max:      Math.max(...sizes),
    exact:    !truncated,
    runs,
    outcomes: all.length,
    possible,
    certain:  [...counts.entries()].filter(([, n]) => n === all.length).map(([vm]) => vm),
    sets:     all.map((o) => o.map((e) => e.vm).sort().join(','))
  };
}
