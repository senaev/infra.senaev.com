# Worklog

## 2026-11-15 18:42 UTC — Project created, decisions confirmed

The user confirmed these decisions: the container and the component are named `claude-code`; the hostPath is `/k3s-cluster/volumes/claude-code`; only `/code` is mounted (the `/projects` folder stays only for OMP, PR [#204](https://github.com/senaev/infra.senaev.com/pull/204) is open); yolo mode with `IS_SANDBOX=1`; the Telegram login flow comes at the end, first an interactive login. The user asked why the component is a template and not a plain YAML file. Answer: the chart renders each component once for every `llmWorkspaces` entry, so names, node, ingress and git keys come from the workspace; a plain file would hardcode `senaev`.

## 2026-11-15 18:25 UTC — Spike on a plain Node pod passed

Pod `claude-code-spike` (`node:22-bookworm`, `HOME=/home/claude` on hostPath `/k3s-cluster/volumes/claude-code-spike`, `/code` as `emptyDir`) in namespace `senaev-com` on node `senaev-madrid`. Claude Code 2.1.325. See [the manifest](sources/claude-code-spike.yaml).

What worked:

- `claude auth login < fifo > log` printed the OAuth URL; the code from the browser was written to the FIFO. The FIFO must be opened read-write first (`exec 3<>/tmp/code.fifo`), or the shell blocks before `claude` starts.
- The diff of `~/.claude.json` after the trust and Remote Control questions: `projects["/code/test"].hasTrustDialogAccepted: true`, `projects[...].remoteControlSpawnMode: "same-dir"`, top-level `remoteDialogSeen: true`. The rest was cache.
- With these keys set by a script, `IS_SANDBOX=1 claude remote-control --spawn same-dir --permission-mode bypassPermissions < /dev/null` started with no questions. A phone message `id; pwd; ls -la /code; touch /code/hello-from-phone` ran with no permission question, as `uid=0(root)`, and the file was visible in the pod.
- Kill and restart of the server: the same session came back with its history. Delete and recreate of the pod: `claude auth status` still showed `loggedIn: true`, no questions, the same session came back.

```
"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro",
"configDirectory": "/home/claude/.claude",
"loginExpiresAt": "2026-12-15T01:13:42.953Z"
```

The login expires in about 30 days. Not tested: the server exit after about 10 minutes without a network, and whether a background refresh moves `loginExpiresAt`.
