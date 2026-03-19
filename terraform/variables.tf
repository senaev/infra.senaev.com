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
