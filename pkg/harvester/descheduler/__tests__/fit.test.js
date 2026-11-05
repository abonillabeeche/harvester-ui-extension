import { matchesNodeSelector, podFitsNode, toleratesTaints } from '../utils/fit';
const node = (labels = {}, extra = {}) => ({ metadata: { name: 'n', labels }, spec: extra });
const pod = (spec = {}) => ({ spec });

describe('matchesNodeSelector', () => {
  it('requires every nodeSelector label', () => {
    expect(matchesNodeSelector(pod({ nodeSelector: { a: '1', b: '2' } }), node({
      a: '1', b: '2', c: '3'
    }))).toBe(true);
    expect(matchesNodeSelector(pod({ nodeSelector: { a: '1', b: '2' } }), node({ a: '1' }))).toBe(false);
  });
  it('handles required node affinity operators (terms ORed, expressions ANDed)', () => {
    const aff = (...terms) => pod({ affinity: { nodeAffinity: { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: terms } } } });
    const t = {
      matchExpressions: [{
        key: 'net', operator: 'In', values: ['true']
      }, { key: 'obsolete', operator: 'DoesNotExist' }]
    };

    expect(matchesNodeSelector(aff(t), node({ net: 'true' }))).toBe(true);
    expect(matchesNodeSelector(aff(t), node({ net: 'true', obsolete: 'x' }))).toBe(false);
    expect(matchesNodeSelector(aff(t), node({}))).toBe(false);
    expect(matchesNodeSelector(aff(t, { matchExpressions: [{ key: 'other', operator: 'Exists' }] }), node({ other: '' }))).toBe(true);
    expect(matchesNodeSelector(aff({
      matchExpressions: [{
        key: 'x', operator: 'NotIn', values: ['a']
      }]
    }), node({ x: 'b' }))).toBe(true);
  });
});
describe('taints and cordon', () => {
  const tainted = node({}, {
    taints: [{
      key: 'node-role.kubernetes.io/etcd', effect: 'NoExecute', value: 'true'
    }]
  });

  it('keeps pods off nodes with untolerated NoSchedule/NoExecute taints', () => {
    expect(toleratesTaints(pod(), tainted)).toBe(false);
    expect(toleratesTaints(pod({ tolerations: [{ key: 'node-role.kubernetes.io/etcd', operator: 'Exists' }] }), tainted)).toBe(true);
    expect(toleratesTaints(pod({ tolerations: [{ operator: 'Exists' }] }), tainted)).toBe(true);
  });
  it('ignores PreferNoSchedule', () => {
    expect(toleratesTaints(pod(), node({}, { taints: [{ key: 'k', effect: 'PreferNoSchedule' }] }))).toBe(true);
  });
  it('rejects cordoned nodes', () => {
    expect(podFitsNode(pod(), node({}, { unschedulable: true }))).toBe(false);
    expect(podFitsNode(pod(), node())).toBe(true);
  });
});
