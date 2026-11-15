# 2026-11-15 — Inter-service certificate authentication

Replace shared-token authentication between cluster-helper and the Obsidian vault service with reusable internal mTLS authentication.

## Goal

Internal HTTPS with mutual certificate verification: each side verifies the intended
service identity, and the receiving service explicitly authorizes the caller.
The first migration is cluster-helper → obsidian-sync (the vault container/API).
Build a reusable foundation for other services, including
[approved node commands](../2026-11-15-10-44-approved-node-commands/README.md).

## Context

- Current callers: [obsidianSyncApi.ts](../../cluster-helper/src/obsidianSyncApi.ts).
- Current internal token: `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN`
  in [env.ts](../../cluster-helper/src/env.ts).
- Current service wiring: [cluster-helper Helm template](../../provisioning/helm/senaev-com/templates/cluster-helper.yaml)
  and [obsidian-sync template](../../provisioning/helm/senaev-com/templates/obsidian-sync.yaml).
- Certificate lifecycle is managed through the Kubernetes ecosystem; cert-manager
  with a dedicated private issuer is the proposed approach. The issuer backend
  (Kubernetes-held CA versus Vault PKI) remains a design choice.
- Do not reuse the Kubernetes control-plane CA. Applications receive only their own
  private keys and the required public trust bundle; no CA signing key.
- Keep NetworkPolicy as an additional layer. A trusted certificate alone does not
  authorize every service to call every endpoint.
- First release migrates this connection only. Inventory other obsidian-sync callers,
  public proxy paths and callbacks before cutover; preserve their intended behavior
  without leaving a bypass to protected vault operations.

## Plan

1. Resolve the design decisions below and inventory all affected request paths.
2. Implement private issuance, restricted certificate requests and per-service
   identities. Prevent workloads from requesting another service's identity or
   mounting its private key; isolate credentials from LLM workspaces.
3. Automate issuance, renewal and private-key rotation, Kubernetes Secret delivery,
   and application reload so renewed credentials are used without manual copying.
4. Distribute trust bundles; implement and document CA replacement with overlapping
   trust, CA expiry monitoring, backup/recovery and compromised-identity response.
5. Integrate reusable HTTPS/mTLS client/server support and explicit caller authorization.
   Authenticate cluster-helper to obsidian-sync and verify obsidian-sync on the client.
6. Stage migration with a bounded rollback plan. Remove legacy token acceptance and
   obsolete secret wiring after verification; no automatic downgrade to plaintext
   or token authentication after completion.
7. Add certificate-expiry/renewal-failure monitoring and Telegram alerts, operational
   runbooks and end-to-end tests before marking the foundation reusable.

## Remaining design decisions

These are proposals, not user-approved choices:

| Decision | Recommended starting point |
|---|---|
| Where mTLS is enforced | Applications with shared client/server utilities; defer a service mesh. |
| Who issues identities | cert-manager with a dedicated Kubernetes-managed private CA initially; decide whether Vault PKI should own signing instead. |
| Identity and authorization | One identity per service, explicit allowed callers per API; node executors additionally need node-specific identity. |
| Migration and failure behavior | Staged cutover, then mTLS only; authentication failures block requests, with explicit operator rollback. |
| Compromised identity response | A documented way to block a caller immediately and replace its credentials; select certificate lifetime to bound residual exposure. |

## Verification

- Existing vault read/search and authorized writes work end-to-end through cluster-helper.
- Missing, expired, untrusted or wrong-service certificates fail; another valid service
  certificate cannot impersonate cluster-helper. Client rejects the wrong server identity.
- Certificate renewal and key rotation are consumed by running services; simulate renewal
  failure and verify alerts before expiry. Existing valid credentials work until expiry.
- CA replacement succeeds through trust overlap; removal of old trust rejects old chains.
- Workloads cannot obtain another service's identity or read its private keys through
  the intended deployment/issuance permissions.
- Legacy bearer token and plaintext access cannot bypass the migrated protected API.
- Other legitimate vault clients, public proxy paths and callbacks retain intended behavior.
- Recovery and compromised-identity response are exercised and documented.

## Result

Project planned only. No certificate infrastructure deployed or token authentication removed.
Implementation architecture and issuer ownership remain to be agreed.
