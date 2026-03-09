## Install tools

Setup ubuntu shell (read SETUP_UBUNTU_SHELL.md)

Add new machine to the tailnet
https://login.tailscale.com/admin/machines/new-linux

Install `helm`

```shell
wget https://get.helm.sh/helm-v4.1.1-linux-amd64.tar.gz
tar -zxvf helm-v4.1.1-linux-amd64.tar.gz
sudo mv linux-amd64/helm /usr/local/bin/helm
sudo chmod +x /usr/local/bin/helm
```

Install `k9s`

```shell
curl -LO https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz
tar -xzf k9s_Linux_amd64.tar.gz
sudo mv k9s /usr/local/bin/
sudo chmod +x /usr/local/bin/k9s
```

## Deploy cluster

```shell
make
```

Some services will not start, it's needed to provide Vault secrets:
- Get root token on a control plane node `cat ~/k3s-cluster/vault-unseal-keys.json | jq .root_token`
- Create new version of the secret with required keys https://vault.senaev.com/ui/vault/secrets/kv/kv/senaev-com-kv
- Wait a few minutes for kubelet reconciliation
