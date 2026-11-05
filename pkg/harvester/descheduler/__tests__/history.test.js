import { activity, attribute, historyRows, parseCycles } from '../utils/history';
const NOW = Date.UTC(2026, 10, 4, 18, 0, 0);
const cycleLine = (stamp, evicted, req) => `I${ stamp }.426376       1 profile.go:376] "Total number of evictions/requests" extension point="Balance" evictedPods=${ evicted } evictionRequests=${ req }`;
const vmim = (created, annotated = true, name = 'kubevirt-evacuation-abc') => ({
  metadata: {
    name, namespace: 'labs', creationTimestamp: created, annotations: annotated ? { 'kubevirt.io/evacuationMigration': 'harv01lab' } : {}
  },
  spec:   { vmiName: 'rancher-lb' },
  status: {
    phase:          'Succeeded',
    migrationState: {
      sourceNode: 'harv01lab', targetNode: 'harv02lab', startTimestamp: '2026-11-04T10:00:10Z', endTimestamp: '2026-11-04T10:06:10Z'
    }
  }
});

describe('parseCycles', () => {
  it('reads the counters and timestamps (UTC)', () => {
    const c = parseCycles(`noise\n${ cycleLine('1104 10:01:19', 0, 0) }\n${ cycleLine('1104 10:06:19', 2, 3) }`, NOW);

    expect(c).toStrictEqual([
      {
        time: Date.UTC(2026, 10, 4, 10, 1, 19), evictedPods: 0, evictionRequests: 0
      },
      {
        time: Date.UTC(2026, 10, 4, 10, 6, 19), evictedPods: 2, evictionRequests: 3
      }
    ]);
  });
  it('rolls a December line seen in January back to the previous year', () => {
    const c = parseCycles(cycleLine('1231 23:00:00', 0, 0), Date.UTC(2027, 0, 2));

    expect(new Date(c[0].time).getUTCFullYear()).toBe(2026);
  });
  it('handles empty input', () => {
    expect(parseCycles('', NOW)).toStrictEqual([]);
  });
});
describe('attribute', () => {
  const quiet = parseCycles([cycleLine('1104 09:56:19', 0, 0), cycleLine('1104 10:01:19', 0, 0), cycleLine('1104 10:06:19', 0, 0)].join('\n'), NOW);

  it('is a manual migration without the evacuation annotation', () => {
    expect(attribute(vmim('2026-11-04T10:00:00Z', false, 'vm-x'), quiet)).toBe('manual');
  });
  it('is an evacuation when the descheduler logged zero requests around it', () => {
    expect(attribute(vmim('2026-11-04T10:00:00Z'), quiet)).toBe('evacuation');
  });
  it('is the descheduler when a nearby cycle requested evictions', () => {
    const busy = parseCycles([cycleLine('1104 09:56:19', 0, 0), cycleLine('1104 09:59:19', 1, 1)].join('\n'), NOW);

    expect(attribute(vmim('2026-11-04T10:00:00Z'), busy)).toBe('descheduler');
  });
  it('does not blame the descheduler for a cycle that is far away', () => {
    const far = parseCycles([cycleLine('1104 09:40:19', 3, 3), cycleLine('1104 10:01:19', 0, 0)].join('\n'), NOW);

    expect(attribute(vmim('2026-11-04T10:00:00Z'), far)).toBe('evacuation');
  });
  it('cannot tell when the log does not cover the migration', () => {
    expect(attribute(vmim('2026-10-31T19:21:51Z'), quiet)).toBe('evacuationUnverified');
    expect(attribute(vmim('2026-11-04T10:00:00Z'), [])).toBe('evacuationUnverified');
  });
});
describe('historyRows / activity', () => {
  it('builds rows newest first with duration and nodes', () => {
    const rows = historyRows([vmim('2026-11-04T09:00:00Z', true, 'old'), vmim('2026-11-04T10:00:00Z')], []);

    expect(rows.map((r) => r.name)).toStrictEqual(['kubevirt-evacuation-abc', 'old']);
    expect(rows[0]).toMatchObject({
      vm: 'rancher-lb', from: 'harv01lab', to: 'harv02lab', seconds: 360, phase: 'Succeeded', evacuatedNode: 'harv01lab'
    });
  });
  it('reports failures', () => {
    const m = vmim('2026-11-04T10:00:00Z');

    m.status = { phase: 'Failed', migrationState: { failed: true, failureReason: 'Scheduling timeout' } };
    expect(historyRows([m], [])[0].failure).toBe('Scheduling timeout');
  });
  it('sums the descheduler activity', () => {
    const c = parseCycles([cycleLine('1104 10:01:19', 0, 0), cycleLine('1104 10:06:19', 2, 3)].join('\n'), NOW);

    expect(activity(c)).toMatchObject({
      cycles: 2, evictionRequests: 3, evictedPods: 2
    });
  });
});
