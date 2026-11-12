# 2026-11-12 — Shared coding container access rules

Apply one reusable network and Kubernetes API access baseline without changing coding workflows.

## Goal

Reuse OMP's DNS/public-internet egress policy across all coding workspace components.
Disable automatic service-account token mounting and explicitly apply the runtime
default seccomp profile to coding pods. Preserve each component's incoming
callers, users, storage, credentials, filesystem and application configuration.

## Context

- [Shared access helpers](../../provisioning/helm/senaev-com/templates/llm-workspace/_access.tpl)
- [OMP](../../provisioning/helm/senaev-com/templates/llm-workspace/_omp-web.tpl)
- [OpenCode and Telegram](../../provisioning/helm/senaev-com/templates/llm-workspace/_opencode.tpl)
- [Code Tools](../../provisioning/helm/senaev-com/templates/llm-workspace/_code-tools.tpl)

The baseline allows CoreDNS on TCP/UDP 53 and public IPv4/IPv6 destinations,
excluding the existing private, shared and link-local ranges, with one narrow
exception for the workspace-selected Traefik pods in namespace `traefik` on TCP 443.
This permits access through the HTTPS ingress when node public-IP traffic is
DNATed to a pod address. It preserves
Traefik ingress for OMP/OpenCode and cluster-helper ingress for Code Tools.
Replies to accepted incoming connections need no new egress exception.
It applies to every container and init container in each selected pod.

This is a limited access baseline, not Restricted Pod Security compliance or full
sandboxing. Standard NetworkPolicy has local-node and NAT limitations. Public
cluster endpoints are subject to routing/NAT behavior; the explicit Traefik
exception permits the workspace ingress on TCP 443. It allows every HTTPS route
on that controller, not only particular hostnames. NetworkPolicy cannot restrict
HTTP hostnames or paths. Shared writable volumes and existing GitHub,
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
  except explicitly permitted CoreDNS and workspace Traefik TCP 443. Test IPv4 and IPv6.
- Inspect actual pod token mounts and all matching NetworkPolicies.
- Monitor readiness, restarts and errors with Grafana/Datadog.

Source review cannot establish live enforcement or cover user-created scripts.
An existing script that intentionally uses a private endpoint will be blocked.

## Result

The baseline was merged in PR #161 and deployed successfully. Code Tools can
access GitHub and has no mounted service-account token; Telegram reconnected.
Website smoke tests passed for senaev.ru but failed to connect to the .com
endpoints from Code Tools. A follow-up adds the narrow Traefik TCP 443 exception;
PR #162 was merged and deployed: all five website smoke tests now pass.
Tested internal backend, API and Tailscale SSH connections remained unreachable;
all four deployments were available and the checked logs contained no errors.

The next change adds pod-level `seccompProfile.type: RuntimeDefault` to the shared
helper. It covers OMP (both workspaces), OpenCode/Telegram, Code Tools, sidecars and
init containers unless a container overrides the profile. It filters kernel system
calls using the installed runtime's profile, which may vary by node/runtime version.
Users, paths, mounts, credentials and networking remain unchanged. It does not
provide full sandboxing or Restricted Pod Security compliance.

After deployment, confirm startup and readiness for all four deployments; check
`Seccomp: 2` in `/proc/self/status` from each coding container (filter presence alone
does not identify the exact profile), and inspect pod specs when cluster access is
available. Exercise Git, Node/Python subprocesses, dependency installation, builds,
tests, Telegram and OMP/OpenCode sessions. Debuggers, tracing and namespace-based
tools may need additional compatibility checks. Live compatibility is pending;
if a regression is confirmed, revert this seccomp change through the normal PR
and deployment workflow.

Rollback: revert the implementation commit through a PR and the normal deployment
pipeline. This restores OpenCode/Code Tools egress and token defaults; OMP's
effective policy is unchanged.

See [worklog](project-worklog.md).

## Container privilege baseline

A follow-up adds a shared container helper disabling privilege escalation and
dropping all Linux capabilities. All 10 coding containers/init containers include
it. Existing OMP/proxy settings are preserved; OpenCode, Telegram, Code Tools and
both Git init containers gain the restrictions. Users, mounts, seccomp and
networking are unchanged.

Validation: all Helm checks pass; a structural comparison of 96 resources shows
only intended container security changes. A restricted subprocess reported
CapEff/CapBnd zero and NoNewPrivs 1, and passed synthetic owned-file chmod, Git
startup and Node/Python subprocess checks. This is not a test of every container
image or mounted volume.

After deployment verify Git init completes, SSH/Git fetch, dependency installation,
builds/tests and interactive agent sessions. Package-manager scripts may require
chown, switching users or file capabilities; those can fail even while running
as root. Arbitrary system package installation is not guaranteed. Check CapEff,
CapBnd and NoNewPrivs in running coding containers and monitor errors/readiness.
If required functionality regresses, revert this privilege change through a PR
and normal deployment rather than adding broad capabilities without review.

PR #163 was merged and deployed successfully: all four deployments available,
Code Tools seccomp filtering active, Git remote access, Node/Python subprocesses
and all five website smoke checks passed. Telegram reconnected; no persistent
errors were observed. Full builds/debuggers remained untested.
