resource "hcloud_ssh_key" "ecdsa" {
  name       = "ecdsa-key"
  public_key = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBOx9ZqfcNbREx55m3iBB7n91NvU7mynTteeCVIG7lxxpS4dGE9wROwzGpXMHpYfPYUpzQd29hr7I1yJgI5JSFpY="
}

resource "hcloud_ssh_key" "ed25519" {
  name       = "ed25519-key"
  public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKDeqfqHdivt+fz5AANznl3k9oTDKi/md8rKXn/NLJzD"
}

resource "hcloud_server" "control_plane" {
  name        = var.server_name
  server_type = var.server_type
  location    = var.server_location
  image       = var.server_image
  ssh_keys    = [hcloud_ssh_key.ecdsa.id, hcloud_ssh_key.ed25519.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    tailscale_auth_key = tailscale_tailnet_key.hetzner.key
  })

  lifecycle {
    ignore_changes = [user_data]
  }
}
