# Worklog

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
