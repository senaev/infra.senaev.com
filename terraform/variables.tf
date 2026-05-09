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

variable "VPS_PROXMOX_HOST" {
  description = "Proxmox worker host"
  type        = string
}

variable "VPS_PROXMOX_USERNAME" {
  description = "Proxmox worker SSH username"
  type        = string
}

variable "VPS_PROXMOX_LABEL" {
  description = "Proxmox worker VPS label"
  type        = string
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

variable "VPS_FIRSTVDS_HOST" {
  description = "FIRSTVDS worker host"
  type        = string
}

variable "VPS_FIRSTVDS_USERNAME" {
  description = "FIRSTVDS worker SSH username"
  type        = string
}

variable "VPS_FIRSTVDS_LABEL" {
  description = "FIRSTVDS worker VPS label"
  type        = string
}

variable "VPS_VULTR_HOST" {
  description = "Vultr worker host"
  type        = string
}

variable "VPS_VULTR_USERNAME" {
  description = "Vultr worker SSH username"
  type        = string
}

variable "VPS_VULTR_LABEL" {
  description = "Vultr worker VPS label"
  type        = string
}

variable "VPS_NETCUP_HOST" {
  description = "Netcup worker host"
  type        = string
}

variable "VPS_NETCUP_USERNAME" {
  description = "Netcup worker SSH username"
  type        = string
}

variable "VPS_NETCUP_LABEL" {
  description = "Netcup worker VPS label"
  type        = string
}
