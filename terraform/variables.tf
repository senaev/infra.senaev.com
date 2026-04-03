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

variable "TG_TOKEN_SENAEV_COM_BOT" {
  description = "Telegram bot token for senaev.com bot"
  type        = string
  sensitive   = true
}

variable "VPS_MEDIA_HOST" {
  description = "Media worker host"
  type        = string
}

variable "VPS_MEDIA_USERNAME" {
  description = "Media worker SSH username"
  type        = string
}

variable "VPS_MEDIA_LABEL" {
  description = "Media worker VPS label"
  type        = string
}

variable "VPS_RU_HOST" {
  description = "RU worker host"
  type        = string
}

variable "VPS_RU_USERNAME" {
  description = "RU worker SSH username"
  type        = string
}

variable "VPS_RU_LABEL" {
  description = "RU worker VPS label"
  type        = string
}
