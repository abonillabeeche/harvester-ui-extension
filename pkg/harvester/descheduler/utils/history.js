/**
 * Migration history with attribution: who asked for each live migration?
 *
 * A drain/maintenance evacuation and a descheduler eviction leave the SAME kind of record (a `kubevirt-evacuation-*`
 * migration carrying the `kubevirt.io/evacuationMigration` annotation), so the record alone cannot tell them apart.
 * What can: the descheduler logs, every cycle, how many evictions it requested ("Total number of evictions/requests").
 * A cycle with zero requests next to a migration is positive evidence that the descheduler did not cause it.
 */
const LINE = /^[IWE](\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})\.\d+\s+\d+ profile\.go:\d+\] "Total number of evictions\/requests".*?evictedPods=(\d+) evictionRequests=(\d+)/;

/**
 * Parses descheduler (klog) output. klog stamps lines `MMDD hh:mm:ss` in UTC without a year, so the year is taken from `now`
 * (a line that would land more than a day in the future belongs to the previous year).
 */
export function parseCycles(log, now = Date.now()) {
  const year = new Date(now).getUTCFullYear();
  const out = [];

  for (const line of (log || '').split('\n')) {
    const m = LINE.exec(line);

    if (!m) {
      continue;
    }
    let time = Date.UTC(year, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));

    if (time > now + 86400000) {
      time = Date.UTC(year - 1, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
    }
    out.push({
      time, evictedPods: Number(m[6]), evictionRequests: Number(m[7])
    });
  }

  return out;
}
export function activity(cycles) {
  return {
    cycles:           cycles.length,
    from:             cycles[0]?.time,
    to:               cycles[cycles.length - 1]?.time,
    evictionRequests: cycles.reduce((a, c) => a + c.evictionRequests, 0),
    evictedPods:      cycles.reduce((a, c) => a + c.evictedPods, 0)
  };
}
// A migration is created within seconds of the cycle that asked for it; allow for clock skew and slow webhooks.
const BEFORE_MS = 3 * 60000;
const AFTER_MS = 60000;

export function attribute(vmim, cycles) {
  const evacuated = !!vmim?.metadata?.annotations?.['kubevirt.io/evacuationMigration'];

  if (!evacuated) {
    return 'manual';
  }
  const created = Date.parse(vmim.metadata.creationTimestamp);
  const near = cycles.filter((c) => c.time >= created - BEFORE_MS && c.time <= created + AFTER_MS);

  if (near.some((c) => c.evictionRequests > 0 || c.evictedPods > 0)) {
    return 'descheduler';
  }
  // The log must actually cover the moment, otherwise silence proves nothing.
  const covered = cycles.length > 0 && created >= cycles[0].time - BEFORE_MS && created <= cycles[cycles.length - 1].time + AFTER_MS;

  return covered ? 'evacuation' : 'evacuationUnverified';
}
export function historyRows(vmims, cycles) {
  return vmims.map((m) => {
    const st = m.status?.migrationState || {};
    const start = st.startTimestamp ? Date.parse(st.startTimestamp) : NaN;
    const end = st.endTimestamp ? Date.parse(st.endTimestamp) : NaN;

    return {
      name:          m.metadata?.name,
      namespace:     m.metadata?.namespace,
      vm:            m.spec?.vmiName,
      kind:          attribute(m, cycles),
      phase:         m.status?.phase || 'Pending',
      from:          st.sourceNode,
      to:            st.targetNode,
      evacuatedNode: m.metadata?.annotations?.['kubevirt.io/evacuationMigration'],
      created:       Date.parse(m.metadata?.creationTimestamp),
      seconds:       Number.isNaN(start) || Number.isNaN(end) ? undefined : Math.round((end - start) / 1000),
      failure:       st.failed ? (st.failureReason || 'failed') : undefined
    };
  }).sort((a, b) => b.created - a.created);
}
