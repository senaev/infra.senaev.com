/**
 * The services that call cluster-helper over mTLS, each by the DNS name in its client certificate
 * (`provisioning/helm/vpn/templates/vpn-subscription-tls.yaml`). vpn-subscription runs in the
 * `vpn` namespace.
 */
export const VPN_SUBSCRIPTION = 'vpn-subscription.vpn.svc.cluster.local';

/** The services that may call the routes of the mTLS server: see `registerMtlsCallerAllowlist`. */
export const ALLOWED_CALLERS: readonly string[] = [VPN_SUBSCRIPTION];
