variable "HETZNER_TOKEN" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "TAILSCALE_API_KEY" {
  description = "Tailscale API key (Personal Settings → Keys, expires in 90 days)"
  type        = string
  sensitive   = true
}

variable "TG_CLUSTER_CHAT_ID" {
  description = "Telegram chat ID for cluster notifications"
  type        = string
  sensitive   = true
}

variable "TG_TOKEN_SENAEV_COM_BOT" {
  description = "Telegram bot token for senaev.com bot"
  type        = string
  sensitive   = true
}
