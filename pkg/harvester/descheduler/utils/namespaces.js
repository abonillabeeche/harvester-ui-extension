/** Helpers for the descheduler's `evictableNamespaces.exclude` list. */
/** One name per line (commas and spaces also separate), trimmed, de-duplicated, order kept. */
export function parseNamespaces(text) {
  const seen = new Set();

  (text || '').split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => seen.add(s));

  return [...seen];
}
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** Kubernetes namespace names are DNS-1123 labels. Returns the names that are not. */
export function invalidNamespaces(list) {
  return list.filter((n) => n.length > 63 || !DNS_LABEL.test(n));
}
// Namespaces that belong to Kubernetes, Rancher, Harvester or Longhorn themselves.
const SYSTEM = /^(kube-|cattle-|fleet-|harvester-|longhorn-)|^(local|default)$/;

/** Namespaces in `before` but not `after` (i.e. no longer excluded) that look like system namespaces. */
export function removedSystemNamespaces(before, after) {
  const keep = new Set(after);

  return before.filter((n) => !keep.has(n) && SYSTEM.test(n));
}
export const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
/** What the selector offers: every namespace in the cluster plus anything already selected (it may no longer exist), sorted. */
export function namespaceOptions(cluster, selected) {
  return [...new Set([...cluster, ...selected])].sort();
}
