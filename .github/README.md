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
- Use the service-directory name as the image key:

  ```yaml
  image: {{ index .Values.serviceImages "my-service" | default "ghcr.io/senaev/my-service:latest" | quote }}
  ```

- Provide registry pull access, secrets/storage, and configuration checksums for
  required pod restarts (see OMP Web).

## Updates and recovery

Source/shared-library changes rebuild affected consumers; chart-only changes
preserve image digests. Common values/upgrade-script changes apply all charts.
`upgrade-namespace.sh` retains image pins for manual upgrades too.

Fix failures and retry. Use `helm rollback`, or explicitly override
`serviceImages.<service>` with a previous digest. Chart deletion does not uninstall
its release. Images built outside this repository keep their existing pipeline.
