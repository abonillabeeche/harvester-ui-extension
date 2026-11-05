import { formatBytes, formatCores } from '../utils/format';
describe('format', () => {
  it('formats bytes as GiB and millicores as cores', () => {
    expect(formatBytes(62362212410)).toBe('58.1 GiB');
    expect(formatBytes(0)).toBe('0.0 GiB');
    expect(formatCores(9818)).toBe('9.8 cores');
  });
});
