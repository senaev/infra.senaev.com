variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "tailscale_api_key" {
  description = "Tailscale API key (Personal Settings → Keys, expires in 90 days)"
  type        = string
  sensitive   = true
}

variable "tailscale_tailnet" {
  description = "Tailscale tailnet name (e.g. andrei.senaev@gmail.com)"
  type        = string
}

variable "server_name" {
  description = "Hetzner server hostname"
  type        = string
  default     = "hetzner-control-plane"
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cx22"
}

variable "server_location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "nbg1"
}

variable "server_image" {
  description = "Hetzner OS image"
  type        = string
  default     = "ubuntu-24.04"
}
