/**
 * The services that call obsidian-sync, each by the DNS name in its client certificate
 * (`provisioning/helm/senaev-com/templates/internal-mtls.yaml`). The chart is deployed to the
 * `senaev-com` namespace. A route names the services that may call it: see `registerMtlsAuthorization`.
 */
export const CLUSTER_HELPER = 'cluster-helper.senaev-com.svc.cluster.local';
