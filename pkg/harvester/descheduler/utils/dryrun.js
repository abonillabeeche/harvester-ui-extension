import yaml from './yamllib';
import { parseYaml } from './policy';
import { thresholdsValid } from './simulate';
/**
 * "Verify with the real descheduler": instead of guessing, run the actual descheduler binary once with `--dry-run` against
 * the hypothetical policy and compare. This file only GENERATES the manifest and READS the finished Job's log: the user applies
 * it with kubectl.
 *
 * --dry-run in descheduler 0.33 swaps in a fake client, so evictions are simulated in memory and nothing real is evicted.
 * Without --descheduling-interval the binary runs one cycle and exits.
 */
export const DRYRUN_LABEL = 'descheduler-dry-run';
/** The live policy with only the simulator values changed (everything else, e.g. excluded namespaces, stays as is). */
export function buildPolicyYaml(policyRaw, f, lib = yaml) {
  const policy = parseYaml(policyRaw, lib);
  let found = false;

  if (!thresholdsValid({ thresholds: { cpu: f.lowCpu, memory: f.lowMem }, targetThresholds: { cpu: f.targetCpu, memory: f.targetMem } })) {
    throw new Error('A low threshold is above its target threshold; the descheduler would refuse to start');
  }
  if (f.maxPerNode) {
    policy.maxNoOfPodsToEvictPerNode = f.maxPerNode;
  } else {
    delete policy.maxNoOfPodsToEvictPerNode;
  }
  for (const prof of policy.profiles || []) {
    for (const pc of prof.pluginConfig || []) {
      if (pc.name === 'LowNodeUtilization') {
        found = true;
        pc.args = pc.args || {};
        pc.args.thresholds = {
          ...pc.args.thresholds, cpu: f.lowCpu, memory: f.lowMem
        };
        pc.args.targetThresholds = {
          ...pc.args.targetThresholds, cpu: f.targetCpu, memory: f.targetMem
        };
        if (f.excluded !== undefined) {
          const ns = { ...(pc.args.evictableNamespaces || {}) };

          if ((ns.include || []).length && f.excluded.length) {
            throw new Error('The policy uses an include list for namespaces; excluded namespaces cannot be edited here');
          }
          if (f.excluded.length) {
            ns.exclude = f.excluded;
          } else {
            delete ns.exclude;
          }
          if (Object.keys(ns).length) {
            pc.args.evictableNamespaces = ns;
          } else {
            delete pc.args.evictableNamespaces;
          }
        }
      }
      if (pc.name === 'DefaultEvictor') {
        pc.args = { ...pc.args, nodeFit: f.nodeFit };
      }
    }
  }
  if (!found) {
    throw new Error('LowNodeUtilization is not configured in the active policy');
  }

  return lib.dump(policy);
}
const indent = (text, n) => text.replace(/\n$/, '').split('\n').map((l) => `${ ' '.repeat(n) }${ l }`).join('\n');
const stamp = (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);

/** A ConfigMap with the hypothetical policy plus a one-shot Job running the same image/ServiceAccount as the add-on. */
export function buildManifest(policyYaml, image, now = new Date()) {
  const name = `descheduler-dry-run-${ stamp(now) }`;
  const labels = (n) => `labels:\n${ ' '.repeat(n + 2) }app.kubernetes.io/name: ${ DRYRUN_LABEL }`;
  const text = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${ name }
  namespace: kube-system
  ${ labels(2) }
data:
  policy.yaml: |
${ indent(policyYaml, 4) }
---
apiVersion: batch/v1
kind: Job
metadata:
  name: ${ name }
  namespace: kube-system
  ${ labels(2) }
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      ${ labels(6) }
    spec:
      restartPolicy: Never
      serviceAccountName: descheduler
      containers:
        - name: descheduler
          image: ${ image }
          command: ["/bin/descheduler"]
          args:
            - --policy-config-file=/policy-dir/policy.yaml
            - --dry-run
            - --feature-gates=EvictionsInBackground=true
            - --v=3
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { cpu: 500m, memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
          volumeMounts:
            - { name: policy-volume, mountPath: /policy-dir }
      volumes:
        - name: policy-volume
          configMap: { name: ${ name } }
`;

  return { name, yaml: text };
}
export const createCommand = (manifest) => `kubectl --insecure-skip-tls-verify create -f - <<'EOF'\n${ manifest }EOF`;
export const cleanupCommand = () => `kubectl -n kube-system delete job,configmap -l app.kubernetes.io/name=${ DRYRUN_LABEL }`;
const EVICTED = /"Evicted pod in dry run mode" pod="([^"]+)"(?:.*?strategy="([^"]*)")?.*?node="([^"]*)"/;

export function parseDryRunLog(log) {
  const out = [];

  for (const line of (log || '').split('\n')) {
    const m = EVICTED.exec(line);

    if (m) {
      out.push({
        pod: m[1], strategy: m[2], node: m[3]
      });
    }
  }

  return out;
}
/** Compares by pod (namespace/name): the simulator's guess versus what the real binary decided. */
export function compare(sim, real) {
  const s = new Set(sim.map((e) => `${ e.namespace }/${ e.pod }`));
  const r = new Set(real.map((e) => e.pod));

  return {
    agree:         [...s].filter((p) => r.has(p)),
    onlySimulated: [...s].filter((p) => !r.has(p)),
    onlyReal:      [...r].filter((p) => !s.has(p))
  };
}
/**
 * A difference is not necessarily a disagreement: VMs of equal priority and QoS are tried in no particular order, and the loop only
 * stops when no room is left, so different orders give different (but equally valid) results. `replay` is the simulation run with
 * the real descheduler's picks forced to the front of the order; if that yields exactly the VMs the real run evicted, the real
 * choice is one the rules allow. If not, the simulation cannot explain it.
 */
export function isAllowedChoice(replay, real) {
  const a = new Set(replay.map((e) => `${ e.namespace }/${ e.pod }`));
  const b = new Set(real.map((e) => e.pod));

  return a.size === b.size && [...a].every((p) => b.has(p));
}
/** Why a finished dry run produced no result: the descheduler's own error, e.g. a rejected policy. */
export function parseDryRunFailure(log) {
  const m = /"failed to run descheduler server" err="([^"]*)"/.exec(log || '');

  return m ? m[1] : undefined;
}
