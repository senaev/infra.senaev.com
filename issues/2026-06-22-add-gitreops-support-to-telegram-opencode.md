# Checklist: Helm Chart Setup for OpenCode Server

## 1. Dependencies and Tools

- [x] Add `git` to Dockerfile / initContainer
- [x] Add `openssh-client` to the image (for SSH)
- [x] Ensure standard utilities are available (curl, tar, etc.)

## 2. SSH Keys

- [x] Retrieve the TELEGRAM_OPENCODE_SSH_PRIVATE_KEY (`id_rsa`) from Vault
- [x] Mount the Secret at `/root/.ssh/id_rsa` inside the initContainer
- [x] Set permissions: `600` for the private key
- [x] Add GitHub to `known_hosts` (via `ssh-keyscan` in initContainer)

## 3. Folder Structure

- [x] Add folder creation to the init script:
  ```bash
  mkdir -p /projects/git
  ```

## 4. Configuration Files (ConfigMap or Volume)

- [x] Create a ConfigMap with the contents of `provisioning/helm/senaev-com/config/opencode-telegram/AGENTS.md`
- [x] Create a ConfigMap with the contents of `provisioning/helm/senaev-com/config/opencode-telegram/CLAUDE.md`
- [x] Mount both files via Volume into the container root (`/`)
  - `/AGENTS.md`
  - `/CLAUDE.md`

## 5. Repository List

- [x] Create list of pre-installed repos in `values.yaml` under `opencodeTelegram.git.repositories`
  - `git@github.com:senaev/infra.senaev.com.git`
  - `git@github.com:senaev/senaev-laptop-settings.git`
  - `git@github.com:senaev/senaev-utils.git`
  - `git@github.com:senaev/senaev.com.git`
- [x] initContainer clones each repo into `/projects/git`

## 6. Persistent Storage

- [x] PersistentVolumeClaim `opencode-telegram-git` for `/projects/git`
- [x] Mounted in both main containers and initContainer
- [x] `/projects/vault` unchanged (hostPath, as before)

## 7. Init Script (initContainer: `git-init`)

- [x] Sets up SSH key from secret
- [x] Adds GitHub to `known_hosts`
- [x] Clones all repositories from `git.repositories`
- [x] Runs as `alpine/git` initContainer

## 8. Values.yaml

- [x] `git.repositories` — flat list of SSH clone URLs
- [x] `persistence.size` — PVC size (default: `5Gi`)

## 9. Kubernetes Manifests (all in `opencode-serve.yaml`)

- [x] ConfigMap `opencode-telegram-config` (AGENTS.md + CLAUDE.md)
- [x] PersistentVolumeClaim `opencode-telegram-git`
- [x] Deployment with initContainer, mounted secret, PVC, and ConfigMap
- [x] ExternalSecret — added `TELEGRAM_OPENCODE_SSH_PRIVATE_KEY`

## 10. Deployment Verification

- [ ] Deploy via Helm
- [ ] Check initContainer logs: `kubectl logs -n senaev-com deploy/opencode-telegram -c git-init`
- [ ] Verify repos: `kubectl exec -n senaev-com deploy/opencode-telegram -c opencode-serve -- ls /projects/git`
- [ ] Verify config files: `kubectl exec -n senaev-com deploy/opencode-telegram -c opencode-serve -- cat /AGENTS.md`

## 11. Documentation

- [x] `provisioning/helm/senaev-com/config/opencode-telegram/AGENTS.md` updated

## Findings

*(append results below)*
