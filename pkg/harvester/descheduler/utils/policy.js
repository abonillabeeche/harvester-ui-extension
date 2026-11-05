import yaml from './yamllib';
/**
 * Parses YAML text with the JSON schema (plain maps, lists, scalars; no JS types), which is safe in both js-yaml 3 and 4.
 * `safeLoad` must not be used: js-yaml 4 keeps it only as a stub that throws, and the dashboard bundles v4.
 * `lib` is injectable so tests can run both major versions.
 */
export function parseYaml(text, lib = yaml) {
  return lib.load(text);
}
/** Summarises a parsed policy.yaml (as found in the descheduler ConfigMap). */
export function summarisePolicy(policy) {
  const profiles = policy?.profiles || [];
  let args = null;
  let enabled = false;
  let nodeFit;

  for (const p of profiles) {
    for (const pc of p.pluginConfig || []) {
      if (pc.name === 'LowNodeUtilization') {
        args = pc.args || {};
      }
      if (pc.name === 'DefaultEvictor' && pc.args && pc.args.nodeFit !== undefined) {
        nodeFit = !!pc.args.nodeFit;
      }
    }
    if ((p.plugins?.balance?.enabled || []).includes('LowNodeUtilization')) {
      enabled = true;
    }
  }

  return {
    maxNoOfPodsToEvictPerNode: policy?.maxNoOfPodsToEvictPerNode,
    lowNodeUtilization:        args ? {
      thresholds:             args.thresholds || {},
      targetThresholds:       args.targetThresholds || {},
      useDeviationThresholds: !!args.useDeviationThresholds,
      numberOfNodes:          args.numberOfNodes
    } : null,
    lowNodeUtilizationEnabled:  enabled,
    nodeFit,
    evictableNamespacesExclude: args?.evictableNamespaces?.exclude || []
  };
}
