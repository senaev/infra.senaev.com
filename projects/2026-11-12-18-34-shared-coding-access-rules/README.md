# 2026-11-12 — Shared coding container access rules

Apply one reusable network and Kubernetes API access baseline without changing coding workflows.

## Goal

Reuse OMP's DNS/public-internet egress policy across all coding workspace components.
Disable automatic service-account token mounting. Preserve each component's incoming
callers, users, storage, credentials, filesystem and application configuration.

## Context

- [Shared access helpers](../../provisioning/helm/senaev-com/templates/llm-workspace/_access.tpl)
- [OMP](../../provisioning/helm/senaev-com/templates/llm-workspace/_omp-web.tpl)
- [OpenCode and Telegram](../../provisioning/helm/senaev-com/templates/llm-workspace/_opencode.tpl)
- [Code Tools](../../provisioning/helm/senaev-com/templates/llm-workspace/_code-tools.tpl)

The baseline allows CoreDNS on TCP/UDP 53 and public IPv4/IPv6 destinations,
excluding the existing private, shared and link-local ranges. It preserves
Traefik ingress for OMP/OpenCode and cluster-helper ingress for Code Tools.
Replies to accepted incoming connections need no new egress exception.
It applies to every container and init container in each selected pod.

This is a limited access baseline, not Restricted Pod Security compliance or full
sandboxing. Standard NetworkPolicy has local-node and NAT limitations. Public
cluster endpoints remain reachable. Shared writable volumes and existing GitHub,
SSH and application credentials retain their authority. Disabling token mounting
does not revoke separately supplied Kubernetes credentials.
Policy enforcement requires a working controller; another matching policy can
broaden allowed traffic.

## Plan

1. Extract OMP's existing egress rules and token-mount setting into shared helpers.
2. Apply helpers to both OMP workspaces, OpenCode and Code Tools.
3. Render and compare chart resources against the base revision, checking that
   only intended changes occur and incoming callers remain unchanged.
4. Open a PR; after merge, verify rollout, network isolation and coding workflows.

New coding pod templates must include both helpers, select Egress in their
NetworkPolicy and define only their required ingress callers.

## Verification

Completed before PR:
- Helm lint and default-values rendering.
- Structural comparison of all 96 rendered resources: OMP policies unchanged;
  only OpenCode/Code Tools token mounting and egress changed.
- Both OMP workspaces and both other coding deployments use identical egress rules.
- Source inspection found the Telegram client's OpenCode connection uses localhost;
  no required private outgoing application endpoint was found in inspected sources.

After deployment, verify from each coding environment:
- DNS, HTTPS to GitHub/model providers, git fetch and dependency installation.
- OMP chat and speech, OpenCode web/chat/MCP OAuth and Telegram replies.
- Code Tools read/run operations through cluster-helper, including long operations.
- Bounded TCP connection attempts to known pod, Service and Tailscale addresses fail,
  except explicitly permitted CoreDNS. Test IPv4 and IPv6.
- Inspect actual pod token mounts and all matching NetworkPolicies.
- Monitor readiness, restarts and errors with Grafana/Datadog.

Source review cannot establish live enforcement or cover user-created scripts.
An existing script that intentionally uses a private endpoint will be blocked.

## Result

Implementation and chart verification complete; PR review and live verification
remain pending. No cluster changes were performed.

Rollback: revert the implementation commit through a PR and the normal deployment
pipeline. This restores OpenCode/Code Tools egress and token defaults; OMP's
effective policy is unchanged.

See [worklog](project-worklog.md).
