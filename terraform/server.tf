resource "hcloud_ssh_key" "ed25519" {
  name       = "senaev@personal-mac"
  public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKDeqfqHdivt+fz5AANznl3k9oTDKi/md8rKXn/NLJzD"
}

resource "hcloud_server" "control_plane" {
  name        = "hetzner"
  server_type = "cx33"
  location    = "nbg1"
  image       = "debian-13"
  ssh_keys    = [hcloud_ssh_key.ed25519.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    bootstrap_server_script = templatefile("${path.module}/bootstrap-server.sh.tpl", {})
    server_name             = "hetzner"
    tailscale_auth_key      = tailscale_tailnet_key.hetzner.key
  })

  lifecycle {
    ignore_changes = [user_data, ssh_keys]
  }
}
