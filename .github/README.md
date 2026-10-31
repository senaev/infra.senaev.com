# Build and deployment

`deploy.yml`: checks → build/publish affected images → sync provisioning →
`helm upgrade --install --wait`. PRs only check/build; failures block deployment.
Runs are serialized and compare against the last successful deployment, retaining
queued changes. Superseded revisions cannot deploy. First run, missing history
or manual dispatch rebuilds/applies everything.

## Add a service

- Add `<service>/Dockerfile` and enabled Helm resources under
  `provisioning/helm/<chart>`. No separate workflow is needed.
- Defaults: repository-root build context, `ghcr.io/<owner>/<service>` image,
  `senaev-com` chart. Charts are discovered from `Chart.yaml`; use `<namespace>/<chart>`
  for grouped releases, or a flat chart directory when namespace and release match.
  Releases in each namespace deploy sequentially in path order (operator before
  stack in `telemetry`). Optional service exceptions go in `deploy-config.json`.
- Use `ghcr.io/<owner>/<service>:latest` and `imagePullPolicy: Always` in the
  pod template. CI refreshes matching Deployments/StatefulSets/DaemonSets after
  Helm creates/updates the releases, then waits for rollout readiness.
- Provide registry pull access, secrets/storage, and configuration checksums for
  required pod restarts (see OMP Web).

## Updates and recovery

Source/shared-library changes rebuild affected consumers and refresh their pods;
chart-only changes do not trigger extra restarts. Common values/upgrade-script
changes apply all charts.

Fix failures and retry. `helm rollback` restores chart configuration; reverting
application code requires rebuilding/publishing the desired code as `latest`.
Chart deletion does not uninstall its release. Images built outside this repository
keep their existing pipeline.
