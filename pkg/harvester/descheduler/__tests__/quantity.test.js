import { cpuMillis, memBytes, parseQuantity } from '../utils/quantity';
describe('quantity parsing', () => {
  it('parses cpu in cores and millicores', () => {
    expect(cpuMillis('500m')).toBe(500);
    expect(cpuMillis('2')).toBe(2000);
    expect(cpuMillis('1.5')).toBe(1500);
    expect(cpuMillis('22940m')).toBe(22940);
    expect(cpuMillis(undefined)).toBe(0);
  });
  it('parses binary and decimal memory suffixes', () => {
    expect(memBytes('96407744Ki')).toBe(96407744 * 1024);
    expect(memBytes('16Gi')).toBe(16 * 1024 ** 3);
    expect(memBytes('128M')).toBe(128e6);
    expect(memBytes('1G')).toBe(1e9);
    expect(memBytes('1024')).toBe(1024);
  });
  it('treats garbage as zero instead of throwing', () => {
    expect(parseQuantity('abc')).toBe(0);
    expect(parseQuantity('12Zz')).toBe(0);
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity(null)).toBe(0);
  });
});
