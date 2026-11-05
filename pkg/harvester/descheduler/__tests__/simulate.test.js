import { simulate } from '../utils/simulate';
const GI = 1024 ** 3;
const node = (name, cpu, memGi) => ({ metadata: { name }, status: { allocatable: { cpu, memory: `${ memGi }Gi` } } });
const vm = (name, on, cpu, memGi, extra = {}) => ({
  metadata: {
    name: `virt-launcher-${ name }`, namespace: 'default', labels: { 'kubevirt.io': 'virt-launcher', 'vm.kubevirt.io/name': name }
  },
  spec:     {
    nodeName: on, containers: [{ resources: { requests: { cpu, memory: `${ memGi }Gi` } } }], ...extra
  },
  status: { phase: 'Running', qosClass: 'Burstable' }
});
const T = { thresholds: { cpu: 30, memory: 30 }, targetThresholds: { cpu: 50, memory: 50 } };
const nodes = [node('a', '10', 100), node('b', '10', 100)];

describe('simulate', () => {
  it('does nothing when no node is underutilized', () => {
    const pods = [vm('x', 'a', '8', 80), vm('y', 'b', '8', 80)];

    expect(simulate(nodes, pods, T, { nodeFit: true }).reason).toBe('noUnder');
  });
  it('moves VMs from the overutilized node until it reaches target', () => {
    const pods = [vm('x', 'a', '3', 30), vm('y', 'a', '3', 30), vm('z', 'a', '1', 10), vm('q', 'b', '1', 10)];
    const r = simulate(nodes, pods, T, { nodeFit: true });

    expect(r.reason).toBe('ran');
    expect(r.evictions.map((e) => e.vm)).toStrictEqual(['x']);
    expect(r.evictions[0].to).toBe('b');
    expect(r.after.find((u) => u.name === 'a')?.memoryPct).toBe(40);
  });
  it('honours maxPerNode', () => {
    const pods = [vm('x', 'a', '1', 20), vm('y', 'a', '1', 20), vm('z', 'a', '1', 20), vm('q', 'b', '1', 5)];
    const r = simulate(nodes, pods, T, { nodeFit: true, maxPerNode: 1 });

    expect(r.evictions).toHaveLength(1);
  });
  it('stops when the underutilized nodes have no room left up to their target', () => {
    const pods = [vm('x', 'a', '1', 30), vm('y', 'a', '1', 30), vm('q', 'b', '1', 20)];
    const r = simulate(nodes, pods, T, { nodeFit: true });

    expect(r.evictions).toHaveLength(1);
  });
  it('evicts lower priority first', () => {
    const pods = [vm('hi', 'a', '1', 30, { priority: 100 }), vm('lo', 'a', '1', 30, { priority: 0 }), vm('q', 'b', '1', 5)];
    const r = simulate(nodes, pods, T, { nodeFit: true });

    expect(r.evictions[0].vm).toBe('lo');
  });
  it('skips pods that are not virt-launcher', () => {
    const plain = {
      metadata: { name: 'plain' }, spec: { nodeName: 'a', containers: [{ resources: { requests: { cpu: '1', memory: `${ 60 * GI }` } } }] }, status: { phase: 'Running' }
    };
    const r = simulate(nodes, [plain, vm('q', 'b', '1', 5)], T, { nodeFit: true });

    expect(r.evictions).toHaveLength(0);
  });
  it('reports tooFewUnder', () => {
    const pods = [vm('x', 'a', '8', 80), vm('q', 'b', '1', 5)];

    expect(simulate(nodes, pods, { ...T, numberOfNodes: 1 }, { nodeFit: true }).reason).toBe('tooFewUnder');
  });
});
describe('simulate destination guess', () => {
  it('spreads over the underutilized node with the most free memory', () => {
    const three = [node('a', '10', 100), node('b', '10', 100), node('c', '10', 100)];
    const pods = [vm('x', 'a', '1', 30), vm('y', 'a', '1', 30), vm('q', 'b', '1', 20), vm('r', 'c', '1', 5)];
    const r = simulate(three, pods, T, { nodeFit: true });

    expect(r.evictions[0].to).toBe('c');
  });
});
describe('invalid thresholds', () => {
  it('refuses a low threshold above its target, like the real descheduler', () => {
    const bad = { thresholds: { cpu: 70, memory: 70 }, targetThresholds: { cpu: 60, memory: 85 } };

    expect(simulate(nodes, [vm('x', 'a', '8', 80), vm('q', 'b', '1', 5)], bad, { nodeFit: true }).reason).toBe('invalidThresholds');
  });
});
describe('nodeFit uses node selectors and taints', () => {
  const labelled = (name, labels, taints = []) => ({
    ...node(name, '10', 100), metadata: { name, labels }, spec: { taints }
  });

  it('does not treat a pod as movable when no other node satisfies its selector', () => {
    const ns = [labelled('a', { gpu: 'true' }), labelled('b', {})];
    const sel = { nodeSelector: { gpu: 'true' } };
    const pods = [vm('x', 'a', '1', 30, sel), vm('y', 'a', '1', 30, sel), vm('q', 'b', '1', 5)];
    const r = simulate(ns, pods, T, { nodeFit: true });

    expect(r.evictions).toHaveLength(0);
    expect(r.movable.a).toStrictEqual([]);
    expect(simulate(ns, pods, T, { nodeFit: false }).evictions).toHaveLength(1);
  });
  it('never picks a destination whose taint the pod does not tolerate', () => {
    const ns = [labelled('a', {}), labelled('b', {}, [{ key: 'k', effect: 'NoSchedule' }]), labelled('c', {})];
    const pods = [vm('x', 'a', '1', 60), vm('q', 'b', '1', 5), vm('r', 'c', '1', 10)];
    const r = simulate(ns, pods, T, { nodeFit: true });

    expect(r.evictions.map((e) => e.to)).toStrictEqual(['c']);
  });
});
describe('excluded namespaces', () => {
  const inNs = (v, ns) => ({ ...v, metadata: { ...v.metadata, namespace: ns } });
  const pods = [inNs(vm('x', 'a', '1', 30), 'prod'), inNs(vm('y', 'a', '1', 30), 'labs'), vm('q', 'b', '1', 5)];

  it('never evicts pods in an excluded namespace, but still counts their load', () => {
    const r = simulate(nodes, pods, T, { nodeFit: true, excluded: ['prod'] });

    expect(r.evictions.map((e) => e.vm)).toStrictEqual(['y']);
    expect(r.movable.a).toStrictEqual(['y']);
    expect(r.before.find((u) => u.name === 'a')?.memoryPct).toBe(60);
  });
  it('can move them again once the exclusion is removed', () => {
    expect(simulate(nodes, pods, T, { nodeFit: true, excluded: [] }).movable.a).toHaveLength(2);
  });
});
// Behaviour taken from descheduler v0.33.0 (nodeutilization.go evictPods): it only asks "is any room left on the underutilized nodes?"
// before each eviction, never "does THIS pod fit in the room?", so a pod larger than what is left is still evicted, and it keeps going
// while some room remains. Verified against a real --dry-run on the lab (rancher-host-2, 2 cores, was evicted with 1.1 cores of room).
describe('simulate follows the real eviction loop', () => {
  // b has room up to its target for 4 cores and 40 GiB; every VM on a has the same priority and QoS (a tie).
  const pods = [vm('small', 'a', '1', 10), vm('big', 'a', '5', 20), vm('mid', 'a', '1', 10), vm('q', 'b', '1', 10)];
  const key = (name) => `default/virt-launcher-${ name }`;

  it('evicts a VM larger than the room left, then stops because no room remains', () => {
    const r = simulate(nodes, pods, T, { nodeFit: true, order: [key('big')] });

    expect(r.evictions.map((e) => e.vm)).toStrictEqual(['big']);
    expect(r.skipped).toStrictEqual([]);
  });
  it('keeps evicting while any room is left, even if the next VM is bigger than that room', () => {
    const r = simulate(nodes, pods, T, { nodeFit: true, order: [key('small'), key('big')] });

    expect(r.evictions.map((e) => e.vm)).toStrictEqual(['small', 'big']);
  });
  it('can replay the order the real descheduler happened to pick among equal VMs', () => {
    expect(simulate(nodes, pods, T, { nodeFit: true, order: [key('mid')] }).evictions[0].vm).toBe('mid');
  });
  it('never lets a replayed order override priority', () => {
    const prio = [vm('small', 'a', '1', 10, { priority: 0 }), vm('big', 'a', '5', 20, { priority: 100 }), vm('q', 'b', '1', 10)];

    expect(simulate(nodes, prio, T, { nodeFit: true, order: [key('big')] }).evictions[0].vm).toBe('small');
  });
});
