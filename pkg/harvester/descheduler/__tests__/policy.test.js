import { parseYaml, summarisePolicy } from '../utils/policy';
const lab = {
  maxNoOfPodsToEvictPerNode: 5,
  profiles:                  [{
    name:         'default',
    pluginConfig: [
      { name: 'DefaultEvictor', args: { nodeFit: true } },
      {
        name: 'LowNodeUtilization',
        args: {
          thresholds:          { cpu: 30, memory: 30 },
          targetThresholds:    { cpu: 50, memory: 50 },
          evictableNamespaces: { exclude: ['kube-system', 'longhorn-system'] }
        }
      }
    ],
    plugins: { balance: { enabled: ['LowNodeUtilization'] } }
  }]
};

describe('summarisePolicy', () => {
  it('extracts the lab policy', () => {
    const s = summarisePolicy(lab);

    expect(s.lowNodeUtilization).toStrictEqual({
      thresholds:             { cpu: 30, memory: 30 },
      targetThresholds:       { cpu: 50, memory: 50 },
      useDeviationThresholds: false,
      numberOfNodes:          undefined
    });
    expect(s.lowNodeUtilizationEnabled).toBe(true);
    expect(s.nodeFit).toBe(true);
    expect(s.maxNoOfPodsToEvictPerNode).toBe(5);
    expect(s.evictableNamespacesExclude).toStrictEqual(['kube-system', 'longhorn-system']);
  });
  it('distinguishes configured-but-disabled from not configured', () => {
    const disabled = { profiles: [{ pluginConfig: lab.profiles[0].pluginConfig }] };

    expect(summarisePolicy(disabled).lowNodeUtilization).not.toBeNull();
    expect(summarisePolicy(disabled).lowNodeUtilizationEnabled).toBe(false);
    expect(summarisePolicy({ profiles: [] }).lowNodeUtilization).toBeNull();
    expect(summarisePolicy(null).lowNodeUtilization).toBeNull();
  });
});
describe('parseYaml', () => {
  // Real policy.yaml from the lab's descheduler ConfigMap
  const text = [
    'apiVersion: "descheduler/v1alpha2"',
    'kind: "DeschedulerPolicy"',
    'maxNoOfPodsToEvictPerNode: 5',
    'profiles:',
    '- name: default',
    '  pluginConfig:',
    '  - name: LowNodeUtilization',
    '    args:',
    '      thresholds:',
    '        cpu: 30',
    '        memory: 30',
    '      targetThresholds:',
    '        cpu: 50',
    '        memory: 50',
    '  plugins:',
    '    balance:',
    '      enabled:',
    '      - LowNodeUtilization'
  ].join('\n');

  it('parses a real policy', () => {
    const s = summarisePolicy(parseYaml(text));

    expect(s.maxNoOfPodsToEvictPerNode).toBe(5);
    expect(s.lowNodeUtilization?.thresholds).toStrictEqual({ cpu: 30, memory: 30 });
    expect(s.lowNodeUtilizationEnabled).toBe(true);
  });
  it('does not turn tagged YAML into JavaScript values', () => {
    expect(typeof parseYaml('x: !!js/function "function(){}"')?.x).not.toBe('function');
  });
});
