- [ ] Complete all aspects of asynchronous Code Tools and vault filesystem isolation.

## Stage

Partially completed and superseded by newer projects; the isolated Code Tools pod and async operation API are deployed.

## Remaining

- The original plan also required moving Obsidian Sync's vault data off hostPath to a single-pod PVC. `provisioning/helm/senaev-com/templates/obsidian-sync.yaml` still uses hostPath.
- Do not mark this original combined project done until the remaining storage decision is completed or expressly cancelled.
