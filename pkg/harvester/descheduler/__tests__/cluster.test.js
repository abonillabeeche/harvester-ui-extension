import { clusterRequest, resolveUrl } from '../utils/cluster';
describe('resolveUrl', () => {
  it('leaves URLs alone on standalone Harvester', () => {
    expect(resolveUrl('/v1/nodes', false, 'local')).toBe('/v1/nodes');
    expect(resolveUrl('/k8s/clusters/local/api/v1/namespaces', false, 'local')).toBe('/k8s/clusters/local/api/v1/namespaces');
  });
  it('points Steve paths at the selected cluster when embedded in Rancher', () => {
    expect(resolveUrl('/v1/nodes', true, 'c-m-abc')).toBe('/k8s/clusters/c-m-abc/v1/nodes');
    expect(resolveUrl('/v1/pods?exclude=metadata.managedFields', true, 'c-m-abc')).toBe('/k8s/clusters/c-m-abc/v1/pods?exclude=metadata.managedFields');
  });
  it('re-points the Kubernetes API prefix (written as local) and leaves other /k8s/ paths alone', () => {
    expect(resolveUrl('/k8s/clusters/local/api/v1/namespaces', true, 'c-m-abc')).toBe('/k8s/clusters/c-m-abc/api/v1/namespaces');
    expect(resolveUrl('/k8s/clusters/c-x/v1/nodes', true, 'c-m-abc')).toBe('/k8s/clusters/c-x/v1/nodes');
  });
  it('does not guess when the cluster id is unknown', () => {
    expect(resolveUrl('/v1/nodes', true, null)).toBe('/v1/nodes');
  });
});
describe('clusterRequest', () => {
  it('dispatches management/request with the resolved URL and keeps method and data', async() => {
    const dispatch = jest.fn().mockResolvedValue({ ok: true });
    const store = { dispatch, getters: { isMultiCluster: true, clusterId: 'c-1' } };

    await clusterRequest(store)({
      url: '/v1/nodes', method: 'put', data: { a: 1 }
    });
    expect(dispatch).toHaveBeenCalledWith('management/request', {
      url: '/k8s/clusters/c-1/v1/nodes', method: 'put', data: { a: 1 }
    });
  });
});
