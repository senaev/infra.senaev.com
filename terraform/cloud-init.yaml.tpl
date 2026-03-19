#cloud-config
package_update: true
package_upgrade: true

runcmd:
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key=${tailscale_auth_key}
