resource "tailscale_tailnet_key" "hetzner" {
  reusable      = false
  ephemeral     = false
  preauthorized = true
}
