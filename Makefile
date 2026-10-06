-include .env
export

.PHONY: default terraform cluster rsync control-plane workers worker-firstvds worker-proxmox worker-senaev-media services senaev-com secrets telemetry traefik datadog test

CONTROL_PLANE_SERVER_ADDRESS := $(CONTROL_PLANE_SERVER_USERNAME)@$(CONTROL_PLANE_SERVER_IP)
REMOTE := @ssh "$(CONTROL_PLANE_SERVER_ADDRESS)"
CONTROL_PLANE_SCRIPTS := $(K3S_CLUSTER_PATH)/provisioning/control-plane
DEPLOY := $(CONTROL_PLANE_SCRIPTS)/upgrade-namespace.sh

default:
	@echo "🚀 [Makefile] Starting deployment"
	@$(MAKE) terraform
	@$(MAKE) cluster
	@$(MAKE) services
	@echo "🏁 [Makefile] Deployment completed successfully!"

terraform:
	@$(CURDIR)/scripts/apply-terraform.sh

cluster:
	@$(MAKE) control-plane
	@$(MAKE) workers

rsync:
	@echo "👉 [Makefile] Rsyncing provisioning files to server"
	@$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"
	@echo "✅ [Makefile] Provisioning files synced"

control-plane:
	@$(MAKE) rsync

	@echo "👉 [Makefile] Deploying k8s cluster to server"
	$(REMOTE) "$(CONTROL_PLANE_SCRIPTS)/bootstrap-control-plane.sh"
	@echo "✅ [Makefile] k8s cluster deployed"

# The non-sensitive node goes first, so a broken bootstrap fails there before it reaches the
# home nodes (see "Sensitive nodes" in AGENTS.md). Each target can also be run on its own.
workers:
	@echo "👉 [Makefile] Connecting to worker nodes"
	@$(MAKE) worker-firstvds
	@$(MAKE) worker-proxmox
	@$(MAKE) worker-senaev-media
	@echo "✅ [Makefile] Worker nodes connected"

worker-firstvds:
	@$(CURDIR)/scripts/connect-worker.sh "$(VPS_FIRSTVDS_USERNAME)@$(VPS_FIRSTVDS_HOST)" "$(VPS_FIRSTVDS_LABEL)"

worker-proxmox:
	@$(CURDIR)/scripts/connect-worker.sh "$(VPS_PROXMOX_USERNAME)@$(VPS_PROXMOX_HOST)" "$(VPS_PROXMOX_LABEL)"

worker-senaev-media:
	@$(CURDIR)/scripts/connect-worker.sh "$(VPS_MEDIA_USERNAME)@$(VPS_MEDIA_HOST)" "$(VPS_MEDIA_LABEL)"

secrets:
	@$(MAKE) rsync

	$(REMOTE) "$(CONTROL_PLANE_SCRIPTS)/bootstrap-secrets.sh '$(TG_TOKEN_SENAEV_COM_BOT)'"

telemetry:
	@$(MAKE) rsync

	$(REMOTE) "$(DEPLOY) vm-operator telemetry"
	@echo "👉 [Makefile] Waiting for vm-operator webhook to be ready (required for vm-stack CRs)"
	$(REMOTE) "kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n telemetry --timeout=120s"
	@echo "✅ [Makefile] vm-operator webhook ready"

	# vm-stack requires ExternalSecret CRDs for Grafana
	$(REMOTE) "$(DEPLOY) vm-stack telemetry --set-string 'smokepingProber.extraTargets[0]=$(CONTROL_PLANE_SERVER_IP)'"

traefik:
	@$(MAKE) rsync

	$(REMOTE) "$(DEPLOY) traefik traefik"

datadog:
	@$(MAKE) rsync

	$(REMOTE) "$(DEPLOY) datadog datadog"

services:
	@echo "👉 [Makefile] Deploying k8s services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"

	@$(MAKE) traefik

	@$(MAKE) secrets

	@$(MAKE) telemetry

	@$(MAKE) datadog

	@$(MAKE) senaev-com

	@$(MAKE) test

	@echo "✅ [Makefile] k8s services deployed"

senaev-com:
	@echo "👉 [Makefile] Deploying senaev-com services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"

	@$(MAKE) rsync

	$(REMOTE) "$(DEPLOY) senaev-com senaev-com"

	@echo "✅ [Makefile] senaev-com services deployed"

test:
	@$(MAKE) rsync

	$(REMOTE) "$(DEPLOY) test test"
