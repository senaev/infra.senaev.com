output "server_ip" {
  description = "Public IPv4 address of the Hetzner server"
  value       = hcloud_server.control_plane.ipv4_address
}

output "server_status" {
  description = "Current server status"
  value       = hcloud_server.control_plane.status
}
