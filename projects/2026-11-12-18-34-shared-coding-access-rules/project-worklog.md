## 2026-11-12 21:11 UTC — Shared container privilege restrictions

Added a shared container securityContext helper and used it for all coding
containers and init containers, retaining existing proxy settings.

```
CapEff: 0000000000000000
CapBnd: 0000000000000000
NoNewPrivs: 1
PASS: owned-file chmod, Git and Node/Python subprocess with no capabilities/no-new-privileges
PASS: 96 resources compared; only intended container security changes, all 10 containers/init containers covered
Helm charts OK
```

The subprocess test uses synthetic files and does not prove every workload or
package script is compatible. Git init and package/build compatibility require
post-deployment verification. Previous seccomp rollout succeeded; details are
recorded in README. This change has not been deployed.

## 2026-11-12 20:46 UTC — Explicit runtime seccomp baseline

User approved a PR for pod-level RuntimeDefault in the shared helper. Existing
container users, credentials, storage and network rules are preserved. Rendering
will verify that only the four coding Deployment pod security contexts change.
Live compatibility checks follow deployment; no cluster changes made here.

PR #162 deployment verification completed previously:

```
All 5 website smoke checks passed
PASS: no mounted Kubernetes token
```

Direct connection attempts to cluster-helper:3000, its observed pod IP:3000,
10.43.0.1:443 and the Hetzner tailnet SSH port failed. This is evidence of
unreachability, not by itself proof of the mechanism rejecting each connection.

## 2026-11-12 20:20 UTC — Allow workspace HTTPS ingress

PR #161 was merged and deployment succeeded. Post-deploy Code Tools checks:

```
PASS https://senaev.ru -> https://senaev.ru/
PASS: no mounted service-account token
GitHub HTTPS: 200
4 smoke check(s) failed
```

The four failures are .com endpoints on Hetzner public TCP 443. The repository
maps that host port to Traefik pod TCP 443. NAT/policy interaction is the working
hypothesis, not a proven live packet trace. User approved a narrow ingress
exception: namespace traefik, app traefik, workspace traefik-deployment, TCP 443.
No HTTP, 8443, Xray, backend or broad private-network allowance is added.
This applies to all coding components and all HTTPS routes on that controller.
Validate the five website checks after deployment and retain negative checks.

## 2026-11-12 18:34 UTC — Implemented shared baseline

User approved the narrow network/API access scope; broader container hardening is
excluded. Extracted OMP's existing rules, retained component-specific ingress and
applied helpers to all coding components.

Verification output:

```
1 chart(s) linted, 0 chart(s) failed
PASS: 96 resources compared; only intended changes; all four coding deployments share the baseline; ingress unchanged.
```

Live verification follows merge/deployment; no cluster writes were performed.
