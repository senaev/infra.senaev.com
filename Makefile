-include .env
export

.PHONY: default terraform cluster rsync control-plane workers services senaev-com

CONTROL_PLANE_SERVER_ADDRESS := $(CONTROL_PLANE_SERVER_USERNAME)@$(CONTROL_PLANE_SERVER_IP)

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
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/bootstrap-control-plane.sh"
	@echo "✅ [Makefile] k8s cluster deployed"

workers:
	@echo "👉 [Makefile] Connecting to worker nodes"
	@$(CURDIR)/scripts/connect-all-workers.sh
	@echo "✅ [Makefile] Worker nodes connected"

services:
	@echo "👉 [Makefile] Deploying k8s services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@$(MAKE) rsync
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh traefik traefik"
	@echo "👉 [Makefile] Deploying vm-operator (provides VMServiceScrape CRDs for kafka)"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh vm-operator telemetry"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n telemetry --timeout=120s"
	@echo "👉 [Makefile] Deploying kafka (must be ready before vault bootstrap for unseal notification)"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh kafka senaev-com --wait"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/bootstrap-secrets.sh"
	@echo "👉 [Makefile] Deploying vm-stack (needs vm-operator CRDs + vault secrets)"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh vm-stack telemetry"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh senaev-com senaev-com"
	@echo "✅ [Makefile] k8s services deployed"

senaev-com:
	@echo "👉 [Makefile] Deploying senaev-com services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@$(MAKE) rsync
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh kafka senaev-com --wait"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(K3S_CLUSTER_PATH)/provisioning/control-plane/upgrade-namespace.sh senaev-com senaev-com"
	@echo "✅ [Makefile] senaev-com services deployed"
