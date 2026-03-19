#cloud-config
package_update: true
package_upgrade: true

packages:
  - jq

runcmd:
  # Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key=${tailscale_auth_key}
  # Helm
  - curl -fsSL https://get.helm.sh/helm-v4.1.1-linux-amd64.tar.gz | tar -xz -C /tmp
  - mv /tmp/linux-amd64/helm /usr/local/bin/helm && chmod +x /usr/local/bin/helm
  # k9s
  - curl -fsSL -L https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz | tar -xz -C /tmp
  - mv /tmp/k9s /usr/local/bin/k9s && chmod +x /usr/local/bin/k9s
