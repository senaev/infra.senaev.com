/**
 * The service that calls node-shell, by the DNS name in its client certificate
 * (`provisioning/helm/senaev-com/templates/internal-mtls.yaml`). It asks the user in Telegram
 * before it sends a command here. The chart is deployed to the `senaev-com` namespace.
 */
export const CLUSTER_HELPER = 'cluster-helper.senaev-com.svc.cluster.local';

/** The services that may call the routes: see `registerMtlsCallerAllowlist`. */
export const ALLOWED_CALLERS: readonly string[] = [CLUSTER_HELPER];
