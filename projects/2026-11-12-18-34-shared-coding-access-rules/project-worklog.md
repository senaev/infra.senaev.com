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
