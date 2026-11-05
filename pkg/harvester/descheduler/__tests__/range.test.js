import { simulate } from '../utils/simulate';
import { simulateRange } from '../utils/range';
const GI = 1024 ** 3;
const node = (name) => ({ metadata: { name }, status: { allocatable: { cpu: '10', memory: `${ 100 * GI }` } } });
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
const nodes = [node('a'), node('b')];
const opts = { nodeFit: true };
const key = (name) => `default/virt-launcher-${ name }`;
// b has room for 4 cores / 40 GiB; a is over target and holds three VMs of equal priority and QoS (a tie), one of them large.
const tie = [vm('small', 'a', '1', 10), vm('big', 'a', '5', 20), vm('mid', 'a', '1', 10), vm('q', 'b', '1', 10)];
const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe('simulateRange', () => {
  it('reports the lowest and highest number of evictions over all orders of equal VMs', () => {
    const r = simulateRange(nodes, tie, T, opts);

    // big first uses up the room: 1 VM. small and mid first keep going or stop once a is back to its target: 2 VMs.
    expect(r.min).toBe(1);
    expect(r.max).toBe(2);
    expect(r.exact).toBe(true);
    expect(r.outcomes).toBe(4);
  });
  it('names the VMs that could be picked, and which are certain', () => {
    const r = simulateRange(nodes, tie, T, opts);

    expect(r.possible.a.sort()).toStrictEqual(['big', 'mid', 'small']);
    expect(r.certain).toStrictEqual([]);
  });
  it('covers every order the real descheduler could use (checked against all permutations)', () => {
    const r = simulateRange(nodes, tie, T, opts);
    const sets = new Set(r.sets);

    for (const order of permutations(['small', 'big', 'mid'])) {
      const real = simulate(nodes, tie, T, { ...opts, order: order.map(key) }).evictions.map((e) => e.vm).sort().join(',');

      expect(sets.has(real)).toBe(true);
    }
  });
  it('is a single certain outcome when nothing is a tie', () => {
    const prio = [vm('small', 'a', '1', 10, { priority: 0 }), vm('big', 'a', '5', 20, { priority: 100 }), vm('q', 'b', '1', 10)];
    const r = simulateRange(nodes, prio, T, opts);

    expect(r.min).toBe(r.max);
    expect(r.outcomes).toBe(1);
    expect(r.certain).toStrictEqual(['small']);
  });
  it('is zero when nothing moves', () => {
    const r = simulateRange(nodes, [vm('x', 'a', '1', 10), vm('q', 'b', '1', 10)], T, opts);

    expect(r).toMatchObject({
      min: 0, max: 0, exact: true
    });
  });
  it('stays within a run budget and says so when it could not look at every order', () => {
    const many = [...Array(8)].map((_, i) => vm(`v${ i }`, 'a', '1', 6)).concat(vm('q', 'b', '1', 5));
    const r = simulateRange(nodes, many, T, opts, 12);

    expect(r.exact).toBe(false);
    expect(r.runs).toBeLessThanOrEqual(12 + 2);
    expect(r.min).toBeLessThanOrEqual(r.max);
  });
});
