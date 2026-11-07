- [x] Make Prowlarr write its database and return search results

## Stage

Completed — verified from the existing README, implementation history and (where available) deployed behavior.

## Evidence

- Prowlarr database permissions recovered and the provisioning chown bug fixed; root cause and resolution recorded in README.
- See [original project README](README.md) for the historical decisions, checks and deployment evidence.

## Nonblocking follow-up

Separate Traefik certificate-file permissions were noted in the original incident; not a blocker for the Prowlarr fix.
