# Next step — Automated workspace security checks

## Goal

Make the current shared baseline a CI requirement before further runtime
hardening. This step changes validation only, with no new workload restrictions.

## Implementation scope

Render the senaev-com chart using production common/chart values. Discover every
enabled coding deployment from workspace/component configuration rather than a
fixed list of current names. Use structural YAML parsing, not text matching.

For each coding pod assert:
- Service-account token automount is false; pod seccomp is RuntimeDefault.
- Every application, proxy and init container disables privilege escalation,
  drops ALL capabilities and adds none, is not privileged, and does not override
  seccomp to Unconfined.
- Host networking, host PID and host IPC are not enabled.
- A matching egress policy exists with only the approved CoreDNS, selected
  workspace Traefik TCP 443 and public-IP rules. Check all matching policies to
  detect another policy granting broad access.
- References to the broad shared Secret are absent. Dedicated ExternalSecrets
  contain exactly the properties referenced by each component; retain the
  separate OpenCode password Secret and OMP's existing Secret.

Integrate the check with the existing Helm validation gate. Declare any YAML
parser dependency explicitly. Render at least the defaults, a new workspace
name, an alternate ingress controller, and disabled component combinations.

## Verification

Deliberately mutate fixtures to enable privilege escalation, omit a container's
helper, broaden egress or reference the shared Secret; each must fail with a
resource/container-specific explanation. Valid alternate workspace settings
must pass. Keep validation offline and fast.

These checks enforce declared manifests, not live kernel/CNI behavior or
admission-injected containers. Retain post-deployment runtime and network checks.

## Rollout and acceptance

No pod templates or live permissions change. Acceptance is a passing CI gate plus
negative fixtures proving it detects regressions. Subsequent hardening such as
non-root users requires a separate compatibility/migration plan.
