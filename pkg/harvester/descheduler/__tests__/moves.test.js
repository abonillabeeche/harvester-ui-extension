import { countBy, head, routeCounts } from '../utils/moves';
const ev = (vm, from, to) => ({
  vm, pod: `virt-launcher-${ vm }`, namespace: 'ns', from, to, requests: { cpu: 1000, memory: 1024 }
});

describe('routeCounts', () => {
  it('counts VMs per route, biggest first', () => {
    const r = routeCounts([ev('a', 'n2', 'n1'), ev('b', 'n2', 'n3'), ev('c', 'n2', 'n1'), ev('d', 'n2', 'n1')]);

    expect(r).toStrictEqual([{
      from: 'n2', to: 'n1', count: 3
    }, {
      from: 'n2', to: 'n3', count: 1
    }]);
  });
  it('breaks ties by name so the order is stable', () => {
    const r = routeCounts([ev('a', 'n2', 'n3'), ev('b', 'n2', 'n1')]);

    expect(r.map((x) => x.to)).toStrictEqual(['n1', 'n3']);
  });
  it('counts a move without a known destination under "?"', () => {
    expect(routeCounts([ev('a', 'n2', null)])).toStrictEqual([{
      from: 'n2', to: '?', count: 1
    }]);
  });
  it('is empty when nothing moves', () => {
    expect(routeCounts([])).toStrictEqual([]);
  });
});
describe('head', () => {
  it('returns everything when the list is short', () => {
    expect(head([1, 2], 3)).toStrictEqual({ shown: [1, 2], more: 0 });
  });
  it('cuts a long list and says how many were left out', () => {
    expect(head([1, 2, 3, 4, 5], 3)).toStrictEqual({ shown: [1, 2, 3], more: 2 });
  });
  it('never shows a negative number of items', () => {
    expect(head([1, 2], -1)).toStrictEqual({ shown: [], more: 2 });
  });
});
describe('countBy', () => {
  it('counts per key in first-seen order', () => {
    expect(countBy(['b', 'a', 'b'], (x) => x)).toStrictEqual([{ key: 'b', count: 2 }, { key: 'a', count: 1 }]);
  });
});
