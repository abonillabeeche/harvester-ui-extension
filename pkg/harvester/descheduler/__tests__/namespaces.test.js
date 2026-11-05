import {
  invalidNamespaces, namespaceOptions, parseNamespaces, removedSystemNamespaces, sameSet
} from '../utils/namespaces';
describe('namespaces', () => {
  it('parses lines, commas and spaces, trims and de-duplicates', () => {
    expect(parseNamespaces('a\n b ,c\n\na')).toStrictEqual(['a', 'b', 'c']);
    expect(parseNamespaces('')).toStrictEqual([]);
  });
  it('flags names that are not valid namespace names', () => {
    expect(invalidNamespaces(['kube-system', 'a', 'a1-b2'])).toStrictEqual([]);
    expect(invalidNamespaces(['Has-Caps', '-lead', 'trail-', 'under_score', 'a'.repeat(64)])).toHaveLength(5);
  });
  it('lists system namespaces that stop being excluded, and only those', () => {
    expect(removedSystemNamespaces(['kube-system', 'labs', 'cattle-system', 'local'], ['labs'])).toStrictEqual(['kube-system', 'cattle-system', 'local']);
    expect(removedSystemNamespaces(['labs'], [])).toStrictEqual([]);
    expect(removedSystemNamespaces(['kube-system'], ['kube-system', 'x'])).toStrictEqual([]);
  });
  it('compares lists as sets', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a'], ['a', 'b'])).toBe(false);
  });
});
describe('namespaceOptions', () => {
  it('merges cluster and selected names, de-duplicated and sorted', () => {
    expect(namespaceOptions(['b', 'a'], ['c', 'a'])).toStrictEqual(['a', 'b', 'c']);
  });
});
