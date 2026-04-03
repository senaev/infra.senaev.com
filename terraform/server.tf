// TODO: add in shell script??
resource "hcloud_ssh_key" "ecdsa" {
  name       = "senaev@yandex-team"
  public_key = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBOx9ZqfcNbREx55m3iBB7n91NvU7mynTteeCVIG7lxxpS4dGE9wROwzGpXMHpYfPYUpzQd29hr7I1yJgI5JSFpY="
}

resource "hcloud_ssh_key" "ed25519" {
  name       = "senaev@personal-mac"
  public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKDeqfqHdivt+fz5AANznl3k9oTDKi/md8rKXn/NLJzD"
}

resource "hcloud_server" "control_plane" {
  name        = "hetzner"
  server_type = "cx23"
  location    = "nbg1"
  image       = "ubuntu-24.04"
  ssh_keys    = [hcloud_ssh_key.ecdsa.id, hcloud_ssh_key.ed25519.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    bootstrap_server_script = templatefile("${path.module}/bootstrap-server.sh.tpl", {
      tailscale_auth_key = tailscale_tailnet_key.hetzner.key
    })
  })

  lifecycle {
    ignore_changes = [user_data, ssh_keys]
  }
}
