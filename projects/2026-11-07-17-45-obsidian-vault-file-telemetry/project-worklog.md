## 2026-11-07 17:45 UTC — New project scoped

After the yearly financial CSV migration, requested vault telemetry for file count, counts and sizes by type, largest file path/size and an alert for files exceeding 4.5 MB.

Existing starting points: `obsidian-sync` already mounts the live vault; `provisioning/helm/senaev-com/templates/alerts.yaml` contains VictoriaMetrics rules routed to Alertmanager. Project created as a planning-only change in a dedicated infra worktree and branch; no telemetry code or cluster configuration changed yet.
