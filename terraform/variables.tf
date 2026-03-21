# TODO: uppercase
variable "hetzner_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

# TODO: uppercase
variable "tailscale_api_key" {
  description = "Tailscale API key (Personal Settings → Keys, expires in 90 days)"
  type        = string
  sensitive   = true
}

variable "TG_CLUSTER_CHAT_ID" {
  description = "Telegram chat ID for cluster notifications"
  type        = string
  sensitive   = true
}

variable "TOKEN_senaev_com_bot" {
  description = "Telegram bot token for senaev.com bot"
  type        = string
  sensitive   = true
}
