resource "terraform_data" "tailscale_tailnet_key_rotation" {
  input = timestamp()
}

resource "tailscale_tailnet_key" "hetzner" {
  reusable      = false
  ephemeral     = false
  preauthorized = true

  lifecycle {
    replace_triggered_by = [terraform_data.tailscale_tailnet_key_rotation]
  }
}
