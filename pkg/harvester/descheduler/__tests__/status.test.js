import { runState } from '../utils/status';
describe('runState', () => {
  const on = { spec: { enabled: true } };

  it('tells the four situations apart', () => {
    expect(runState(null, null)).toBe('notInstalled');
    expect(runState({ spec: { enabled: false } }, { status: { readyReplicas: 1 } })).toBe('disabled');
    expect(runState(on, null)).toBe('notReady');
    expect(runState(on, { status: { readyReplicas: 0 } })).toBe('notReady');
    expect(runState(on, { status: { readyReplicas: 1 } })).toBe('running');
  });
});
