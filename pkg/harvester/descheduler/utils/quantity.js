/** Kubernetes resource quantity parsing (just what utilization needs). */
const BINARY = {
  Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6
};
const DECIMAL = {
  n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18
};

/** Parses a quantity into its base unit (cores for cpu, bytes for memory). Unparseable input is 0. */
export function parseQuantity(q) {
  if (q === undefined || q === null || q === '') {
    return 0;
  }
  if (typeof q === 'number') {
    return q;
  }
  const m = /^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)([A-Za-z]*)$/.exec(q.trim());

  if (!m) {
    return 0;
  }
  const n = Number(m[1]);
  const suffix = m[2];

  if (Number.isNaN(n)) {
    return 0;
  }
  if (suffix === '') {
    return n;
  }
  if (suffix in BINARY) {
    return n * BINARY[suffix];
  }
  if (suffix in DECIMAL) {
    return n * DECIMAL[suffix];
  }

  return 0;
}
/** CPU in millicores. */
export function cpuMillis(q) {
  return Math.round(parseQuantity(q) * 1000);
}
/** Memory in bytes. */
export function memBytes(q) {
  return Math.round(parseQuantity(q));
}
