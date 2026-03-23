terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    tailscale = {
      source  = "tailscale/tailscale"
      version = "~> 0.28"
    }
  }
}

provider "hcloud" {
  token = var.HETZNER_TOKEN
}

provider "tailscale" {
  api_key = var.TAILSCALE_API_KEY
  tailnet = "andrei.senaev@gmail.com"
}
