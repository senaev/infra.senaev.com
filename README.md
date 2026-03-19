# infra.senaev.com

Infrastructure for my personal cluster, including personal website
https://github.com/senaev/senaev.com

## Deploy cluster

Create and fill `terraform.tfvars` based on `terraform.tfvars.example`

```shell
make
```

Some services will not start, it's needed to provide Vault secrets:

- Get root token on a control plane node `cat /k3s-cluster/vault_unseal_key.json | jq .root_token`
- Create new version of the secret with required keys https://vault.senaev.com/ui/vault/secrets/kv/kv/senaev-com-kv
- Wait a few minutes for kubelet reconciliation

## Setup media server

Read MEDIA_SERVER.md

## Setup VPN

Read XRAY_VPN.md
