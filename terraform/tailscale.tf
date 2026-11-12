resource "terraform_data" "tailscale_tailnet_key_rotation" {
  input = timestamp()
}

# An auto-update restarts tailscaled, which removes tailscale0 and stops k3s. On 2026-11-10
# this left the control plane down for 15 hours. Each node also has its own preference,
# which provisioning/common/bootstrap-node-networking.sh turns off and verifies.
resource "tailscale_tailnet_settings" "this" {
  devices_auto_updates_on = false
}

resource "tailscale_tailnet_key" "hetzner" {
  reusable      = false
  ephemeral     = false
  preauthorized = true

  lifecycle {
    replace_triggered_by = [terraform_data.tailscale_tailnet_key_rotation]
  }
}
