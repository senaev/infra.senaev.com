## 2026-11-22 17:18 UTC — Project started: plan written, three open questions

The user asked for a separate project and pull request for the last open mTLS edge, "nextjs-app and vmagent to
mTLS" (the follow-up of the two earlier mTLS projects). Research, read-only:
- obsidian-sync serves `registerPublicVaultRoutes` (`?note=`, `?file=`, `/metrics`) on plain `:8080`; its protected
  routes are on mTLS `:8443`. The caller allowlist is per instance, so the two callers cannot join the existing
  list (nextjs-app is public-facing and would get every vault route). Plan: one more mTLS instance for each
  caller (`:8444` files for nextjs-app, `:8445` metrics for vmagent), delete the plain instance.
- nextjs-app code is in `senaev/senaev.com` (three places call the global `fetch` with `NOTES_REMOTE_URL`).
  Two ways: a sidecar proxy in this repo (recommended; one pull request, key out of the public-facing
  container), or changing the app (another repository, rollout order across two repositories).
- vmagent is `v1.136.0` (checked in Grafana: `vm_app_version`). [VictoriaMetrics#10393](https://github.com/VictoriaMetrics/VictoriaMetrics/issues/10393)
  (a rotated client certificate is not used on a kept-alive connection) is fixed only from `v1.136.1`.
  The CRD of `VMServiceScrape` has `vm_scrape_params.disable_keep_alive` per endpoint, so the plan sets it for
  this scrape instead of bumping vmagent, and verifies one forced renewal.
- Nothing else calls `obsidian-sync:8080`; obsidian-sync has no kubelet probe.

Open questions are in the README (❓): one port or a per-route allowlist, the way nextjs-app gets its
certificate, and the name of the sidecar. No code yet.
