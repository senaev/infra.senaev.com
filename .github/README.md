# Build and deployment

`deploy.yml` checks every PR/push. It discovers affected services, builds their
images, publishes them on the default branch, then syncs provisioning and runs
`helm upgrade --install --wait` for affected charts. PRs never publish or deploy.
A failed check/build blocks all deployment; Helm failures remain visible.

- Services are top-level `<service>/Dockerfile` files. Context defaults to the repo
  root and registry to `ghcr.io/<repository-owner>/<service>`.
- Charts are `provisioning/helm/<chart>/Chart.yaml`. Namespace defaults to the
  directory name. Built services belong to `senaev-com` unless overridden.
- `.github/deploy-config.json` holds only exceptions: image `repository`, Docker
  `context`, owning `chart`, extra dependency `paths`, or chart `namespaces`.
- Shared `senaev-utils` changes rebuild packages declaring that dependency.
  Common values/upgrade-script changes select every chart. Chart-only updates
  do not rebuild images. Unrelated changes only run checks.

## Add a service or chart

1. Add its Dockerfile and source directory, plus its Kubernetes resources in the
   owning Helm chart. Enable the service in chart values when it should run.
2. In the pod template, use an image override keyed by the source directory:

   ```yaml
   image: {{ index .Values.serviceImages "my-service" | default "ghcr.io/senaev/my-service:latest" | quote }}
   ```

   CI fills the override with the published `repository@sha256:...` reference;
   the fallback supports first manual installation before a CI image is selected.
3. Declare any exceptions in the deployment config. Add the namespace override
   for a new chart only if its namespace differs from its directory name.
4. Include a checksum in the pod template for mounted configuration that requires
   a restart (especially ConfigMap `subPath` mounts); OMP Web is an example.

Code Tools and OMP Web publish to their own `ghcr.io/senaev/code-tools` and
`ghcr.io/senaev/omp-web` packages, using the standard naming convention.

No new workflow or deployment-name list is needed. Registry pull permissions,
secrets and storage prerequisites must exist; the pipeline does not create Vault
credentials or infer application ports/resources. Removing a whole chart does
not automatically uninstall its Helm release.

## Ordering, image pins and recovery

One concurrency group covers builds, sync and Helm, with no cancellation of an
active deployment. GitHub may replace a pending run; planning compares with the
last successful push deployment so those changes are not lost. Initial runs,
missing history and manual dispatch rebuild all discovered services and apply
all charts. Superseded commits are rejected before syncing to the server. The
first merge of this pipeline therefore refreshes all services.

Each build publishes a service/SHA tag and records its immutable digest as a run
artifact. Helm receives image overrides only after every selected build succeeds.
`upgrade-namespace.sh` merges new pins with `serviceImages` from the installed
release, without reusing old chart defaults. Manual chart upgrades preserve pins
too. An explicit final `--set-string serviceImages.<service>=<image@digest>` can
select a rollback image; `helm rollback` restores the previous release values.

Retry a failed deployment after correcting its cause; changes since the last
successful deployment are selected again. No missing-Deployment exception is
needed: Helm installs it. Separate, concurrently triggered rollout jobs are gone.
External images such as the website's image from another repository retain their
existing update mechanism; this workflow builds only services in this repository.

Validation: `actionlint`, repository checks and Helm lint. Helm failures propagate
to the deployment job; `--wait` also checks resource readiness.
