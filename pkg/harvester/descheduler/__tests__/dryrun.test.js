import YAML from 'yaml';
import yamlLib from '../utils/yamllib';
import {
  buildManifest, buildPolicyYaml, compare, isAllowedChoice, parseDryRunFailure, parseDryRunLog
} from '../utils/dryrun';
import { parseYaml } from '../utils/policy';
import { simulate } from '../utils/simulate';
const RAW = `apiVersion: "descheduler/v1alpha2"
kind: "DeschedulerPolicy"
maxNoOfPodsToEvictPerNode: 5
profiles:
  - name: default
    pluginConfig:
      - name: DefaultEvictor
        args:
          nodeFit: true
      - name: LowNodeUtilization
        args:
          thresholds: { cpu: 30, memory: 30 }
          targetThresholds: { cpu: 50, memory: 50 }
          evictableNamespaces:
            exclude: [kube-system]
    plugins:
      balance:
        enabled: [LowNodeUtilization]
`;
const F = {
  lowCpu: 40, lowMem: 40, targetCpu: 60, targetMem: 85, maxPerNode: 2, nodeFit: false
};

describe('buildPolicyYaml', () => {
  it('changes only the simulator values and keeps the rest', () => {
    const out = parseYaml(buildPolicyYaml(RAW, F), yamlLib);
    const lno = out.profiles[0].pluginConfig[1].args;

    expect(lno.thresholds).toStrictEqual({ cpu: 40, memory: 40 });
    expect(lno.targetThresholds).toStrictEqual({ cpu: 60, memory: 85 });
    expect(lno.evictableNamespaces.exclude).toStrictEqual(['kube-system']);
    expect(out.maxNoOfPodsToEvictPerNode).toBe(2);
    expect(out.profiles[0].pluginConfig[0].args.nodeFit).toBe(false);
    expect(out.profiles[0].plugins.balance.enabled).toStrictEqual(['LowNodeUtilization']);
  });
  it('drops the per-node cap when unlimited and refuses a policy without the plugin', () => {
    expect(parseYaml(buildPolicyYaml(RAW, { ...F, maxPerNode: 0 }), yamlLib).maxNoOfPodsToEvictPerNode).toBeUndefined();
    expect(() => buildPolicyYaml('profiles: []', F)).toThrow(/not configured/);
  });
});
describe('buildManifest', () => {
  const m = buildManifest(buildPolicyYaml(RAW, F), 'registry.k8s.io/descheduler/descheduler:v0.33.0', new Date('2026-11-04T18:30:05Z'));
  const docs = YAML.parseAllDocuments(m.yaml).map((d) => d.toJS());

  it('is valid YAML with a ConfigMap and a Job sharing a unique name', () => {
    expect(m.name).toBe('descheduler-dry-run-20261104183005');
    expect(docs.map((d) => d.kind)).toStrictEqual(['ConfigMap', 'Job']);
    expect(docs[1].spec.template.spec.volumes[0].configMap.name).toBe(m.name);
  });
  it('round-trips the policy and always passes --dry-run', () => {
    expect(parseYaml(docs[0].data['policy.yaml'], yamlLib).maxNoOfPodsToEvictPerNode).toBe(2);
    expect(docs[1].spec.template.spec.containers[0].args).toContain('--dry-run');
    expect(docs[1].spec.template.spec.containers[0].args.join(' ')).not.toContain('descheduling-interval');
    expect(docs[1].spec.template.metadata.labels['app.kubernetes.io/name']).toBe('descheduler-dry-run');
  });
});
describe('parseDryRunLog / compare', () => {
  const log = [
    'I1104 18:30:07.1       1 evictions.go:200] "Evicted pod in dry run mode" pod="labs/virt-launcher-a-1" reason="" strategy="LowNodeUtilization" node="harv02lab" profile="default"',
    'I1104 18:30:07.2       1 profile.go:376] "Total number of evictions/requests" evictedPods=1 evictionRequests=0',
    'I1104 18:30:07.3       1 evictions.go:200] "Evicted pod in dry run mode" pod="labs/virt-launcher-b-2" reason="" strategy="LowNodeUtilization" node="harv02lab" profile="default"'
  ].join('\n');

  it('extracts pod, strategy and node', () => {
    expect(parseDryRunLog(log)).toStrictEqual([
      {
        pod: 'labs/virt-launcher-a-1', strategy: 'LowNodeUtilization', node: 'harv02lab'
      },
      {
        pod: 'labs/virt-launcher-b-2', strategy: 'LowNodeUtilization', node: 'harv02lab'
      }
    ]);
    expect(parseDryRunLog('')).toStrictEqual([]);
  });
  it('compares the simulation with the real decision', () => {
    const sim = [{ namespace: 'labs', pod: 'virt-launcher-a-1' }, { namespace: 'labs', pod: 'virt-launcher-c-3' }];

    expect(compare(sim, parseDryRunLog(log))).toStrictEqual({
      agree: ['labs/virt-launcher-a-1'], onlySimulated: ['labs/virt-launcher-c-3'], onlyReal: ['labs/virt-launcher-b-2']
    });
  });
});
describe('invalid policies', () => {
  it('refuses to build a policy whose low threshold is above its target', () => {
    expect(() => buildPolicyYaml(RAW, { ...F, lowCpu: 70 })).toThrow(/above its target/);
  });
  it('extracts the descheduler failure from its log', () => {
    const log = `E1104 18:59:31.689375       1 server.go:73] "failed to run descheduler server" err="in profile default: thresholds' cpu percentage is greater than targetThresholds'"`;

    expect(parseDryRunFailure(log)).toBe("in profile default: thresholds' cpu percentage is greater than targetThresholds'");
    expect(parseDryRunFailure('all fine')).toBeUndefined();
  });
});
describe('excluded namespaces in the dry-run policy', () => {
  it('replaces the exclude list when given, leaves it alone otherwise', () => {
    const withList = parseYaml(buildPolicyYaml(RAW, { ...F, excluded: ['labs', 'kube-system'] }), yamlLib).profiles[0].pluginConfig[1].args;

    expect(withList.evictableNamespaces.exclude).toStrictEqual(['labs', 'kube-system']);
    expect(parseYaml(buildPolicyYaml(RAW, F), yamlLib).profiles[0].pluginConfig[1].args.evictableNamespaces.exclude).toStrictEqual(['kube-system']);
  });
  it('drops the block when the list is emptied', () => {
    expect(parseYaml(buildPolicyYaml(RAW, { ...F, excluded: [] }), yamlLib).profiles[0].pluginConfig[1].args.evictableNamespaces).toBeUndefined();
  });
});
describe('isAllowedChoice (a different pick is not necessarily a disagreement)', () => {
  const GI = 1024 ** 3;
  const node = (name) => ({ metadata: { name }, status: { allocatable: { cpu: '10', memory: `${ 100 * GI }` } } });
  const vm = (name, on, cpu, memGi) => ({
    metadata: {
      name: `virt-launcher-${ name }`, namespace: 'default', labels: { 'kubevirt.io': 'virt-launcher', 'vm.kubevirt.io/name': name }
    },
    spec:     { nodeName: on, containers: [{ resources: { requests: { cpu, memory: `${ memGi }Gi` } } }] },
    status:   { phase: 'Running', qosClass: 'Burstable' }
  });
  const T = { thresholds: { cpu: 30, memory: 30 }, targetThresholds: { cpu: 50, memory: 50 } };
  // b has room for 4 cores / 40 GiB up to its target; the three VMs on a are all Burstable, priority 0 (a tie).
  const nodes = [node('a'), node('b')];
  const pods = [vm('small', 'a', '1', 10), vm('big', 'a', '5', 20), vm('mid', 'a', '1', 10), vm('q', 'b', '1', 10)];
  const real = (...names) => names.map((n) => ({ pod: `default/virt-launcher-${ n }`, node: 'a' }));
  const replay = (r) => simulate(nodes, pods, T, { nodeFit: true, order: r.map((e) => e.pod) }).evictions;

  it('accepts a different VM when the same rules lead to it (the lab case)', () => {
    // simulation alone: small first, so [small, big]; the real run happened to start with big, which uses up the room: [big]
    expect(simulate(nodes, pods, T, { nodeFit: true }).evictions.map((e) => e.vm)).toStrictEqual(['small', 'big']);
    expect(isAllowedChoice(replay(real('big')), real('big'))).toBe(true);
  });
  it('accepts the order that the simulation itself would use', () => {
    expect(isAllowedChoice(replay(real('small', 'big')), real('small', 'big'))).toBe(true);
  });
  it('does not accept a run that stopped while the rules say there was room left', () => {
    // evicting only "small" leaves room, so the rules would have gone on to evict another VM
    expect(isAllowedChoice(replay(real('small')), real('small'))).toBe(false);
  });
  it('does not accept an eviction the rules would never make (e.g. a different node count)', () => {
    expect(isAllowedChoice(replay(real('big', 'mid')), real('big', 'mid'))).toBe(false);
  });
});
