/**
 * Node-level scheduling checks behind the descheduler's `nodeFit`: can this pod run on that node, ignoring capacity?
 * Covers nodeSelector, required node affinity, taints and cordon. Pod (anti-)affinity and topology spread are NOT modelled.
 */
const labelsOf = (node) => node?.metadata?.labels || {};

function expressionMatches(expr, labels) {
  const has = Object.prototype.hasOwnProperty.call(labels, expr.key);
  const values = expr.values || [];

  switch (expr.operator) {
  case 'In': return has && values.includes(labels[expr.key]);
  case 'NotIn': return !has || !values.includes(labels[expr.key]);
  case 'Exists': return has;
  case 'DoesNotExist': return !has;
  case 'Gt': return has && Number(labels[expr.key]) > Number(values[0]);
  case 'Lt': return has && Number(labels[expr.key]) < Number(values[0]);
  default: return true;
  }
}
export function matchesNodeSelector(pod, node) {
  const labels = labelsOf(node);
  const selector = pod?.spec?.nodeSelector || {};

  if (!Object.entries(selector).every(([k, v]) => labels[k] === v)) {
    return false;
  }
  const terms = pod?.spec?.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms || [];

  // Terms are ORed; expressions inside a term are ANDed. No terms = no constraint.
  return terms.length === 0 || terms.some((term) => [
    ...(term.matchExpressions || []),
    ...(term.matchFields || []).filter((f) => f.key === 'metadata.name').map((f) => ({ ...f, key: '__name' }))
  ].every((e) => expressionMatches(e, { ...labels, __name: node?.metadata?.name })));
}
function tolerates(pod, taint) {
  return (pod?.spec?.tolerations || []).some((t) => {
    if (t.effect && t.effect !== taint.effect) {
      return false;
    }
    if (t.operator === 'Exists') {
      return !t.key || t.key === taint.key;
    }

    return t.key === taint.key && (t.value ?? '') === (taint.value ?? '');
  });
}
/** Only NoSchedule and NoExecute taints keep a pod away; PreferNoSchedule does not. */
export function toleratesTaints(pod, node) {
  return (node?.spec?.taints || [])
    .filter((t) => t.effect === 'NoSchedule' || t.effect === 'NoExecute')
    .every((t) => tolerates(pod, t));
}
export function podFitsNode(pod, node) {
  return !node?.spec?.unschedulable && matchesNodeSelector(pod, node) && toleratesTaints(pod, node);
}
