# Worklog

## 2026-11-16 18:25 UTC — GitHub token moved into a general mitm-proxy sidecar

PR #210 (SSH) was merged and deployed: Deploy run 43828138069 succeeded. In `claude-code`:
`ssh-add -l` lists `SHA256:utim4eLj…`, `ssh -T git@github.com` answers `Hi senaev!`, `git fetch`
works, `/root/.ssh` does not exist and `/ssh-agent` is read-only. The other three containers
were not checked from here (no cluster access).

`GH_TOKEN` is a classic token (`x-oauth-scopes: repo, workflow`, no expiry) used only by `gh`.
The user chose a proxy over running `gh` in a sidecar (see README for why), and asked for a
general, light and readable "man in the middle" sidecar: `mitm-proxy/`, TypeScript run by Node 24
without dependencies or a build, `node:24-alpine` + openssl. Tests: 25 (unit rules/authority;
integration with real TLS: header replaced, other hosts only tunneled, untrusted upstream gets
nothing, absolute URL refused, plain HTTP refused, logs without secrets).

End to end against real GitHub, `node src/main.ts` locally and real `gh` with a placeholder:

```
--- gh api user (placeholder token, via proxy):
senaev
--- gh pr list:
#210 🔒️ Keep the SSH key in an ssh-agent sidecar in all LLM workspaces
#209 🐛 Mount the Claude Code SSH key where ssh looks for it
--- same placeholder without proxy:
{   (GitHub's 401 "Bad credentials" body)
--- tunnel to another host through proxy:
404 (objects.githubusercontent.com answered over the plain tunnel)
{"time":"...","event":"request","host":"api.github.com","method":"GET","path":"/user","status":200,"ms":570}
```

The rendered `gh` wrapper also worked, with `NO_PROXY=github.com` set on purpose (it unsets it).
In the rendered chart only the `mitm-proxy` containers reference the `GH_TOKEN` secret key.

## 2026-11-15 22:15 UTC — SSH part covers all four agent containers; other secrets are future tasks

The user chose to move the SSH key into the sidecar for all four containers in this PR, and to
keep the other secrets as future tasks. `opencode-serve`, `code-tools` and `omp-web` now use
`_ssh-agent.tpl` like `claude-code`. The `git-init` key copy is removed. `opencode-serve` and
`code-tools` get GitHub's published host keys in their images instead of `ssh-keyscan`, which
trusts whatever answers first. The `omp-web` and `claude-code` images already had them.
galkin's OMP has no `git` and gets no sidecar. Rendered:

```
galkin-omp-web: init= ssh-mounts=omp-web: proxy: sock-env= vols=
senaev-opencode-telegram: init=ssh-agent ssh-mounts=opencode-serve:/ssh-agent(ro) ... sock-env=opencode-serve vols=ssh-key,ssh-agent
senaev-omp-web: init=ssh-agent ssh-mounts=omp-web:/ssh-agent(ro) proxy: sock-env=omp-web vols=ssh-key,ssh-agent
senaev-code-tools: init=ssh-agent ssh-mounts=code-tools:/ssh-agent(ro) sock-env=code-tools vols=ssh-key,ssh-agent
senaev-claude-code: init=ssh-agent ssh-mounts=claude-code:/ssh-agent(ro) telegram-login: sock-env=claude-code vols=ssh-key,ssh-agent
```

Each agent container mounts only the read-only socket folder and has `SSH_AUTH_SOCK`. Only the
`ssh-agent` sidecar mounts the key. The rendered chart has no `/root/.ssh` mount.

## 2026-11-15 22:00 UTC — Stage 1 written: ssh-agent sidecar for Claude Code

Decisions:

- **Sidecar with a socket, not a hidden file.** The agent is root without approvals, so any
  file that ssh in its container can read, the agent can read too. A separate container with
  `ssh-agent` gives the agent signatures, not the key. ssh-agent accepts root peers, and all
  workspace containers run as root.
- **Native sidecar.** k3s is `v1.36.5+k3s1`, so an init container with
  `restartPolicy: Always` and a startup probe makes the agent container start only after the
  key is loaded, and restarts the sidecar on its own.
- **Image `alpine/git:latest`**, already used by `git-init` in OpenCode and Code Tools, so no
  new image. Its layers have the binaries:

  ```
  RUN /bin/sh -c apk fix &&     apk --no-cache --update add git git-lfs tig gpg less openssh patch perl ...
  usr/bin/ssh
  usr/bin/ssh-add
  usr/bin/ssh-agent
  ```

- **The socket folder is read-only in the agent container**, so the agent cannot replace the
  socket with its own. Connecting to a unix socket works on a read-only mount.

The sidecar script was run locally under `sh`, with the real key copied to a temporary folder.
GitHub was reached only through the agent (`IdentityFile=/nonexistent`):

```
probe:
256 SHA256:utim4eLjSr0KlgQ8qKvArxCOurcZ6n4nlnsqdrcwz4Y opencode-telegram (ED25519)
srw------- 1 root root 0 Nov 15 21:57 agent.sock
github via agent only:
Hi senaev! You've successfully authenticated, but GitHub does not provide shell access.
stopped on TERM
```

The probe command works, the socket is `0600` root, authentication works through the agent,
and the script stops on TERM.

## 2026-11-15 21:54 UTC — Project created, secrets listed

The user asked for a project to isolate sensitive secrets from LLM workspaces, starting with
SSH for Claude Code. The inventory in `README.md` comes from the templates in
`templates/llm-workspace/` and `values.yaml` on `main` at `cfe54649`. The SSH key, `GH_TOKEN` and the
LLM keys are readable in every agent container. The Telegram bot tokens and the OMP htpasswd
are already outside them.
