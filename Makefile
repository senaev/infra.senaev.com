include .env
export

CONTROL_PLANE_SERVER_ADDRESS := $(CONTROL_PLANE_SERVER_USERNAME)@$(CONTROL_PLANE_SERVER_IP)

default:
	@echo "🚀 [Makefile] Starting deployment to control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@$(MAKE) cluster
	@$(MAKE) services
	@echo "🏁 [Makefile] Deployment completed successfully!"

cluster:
	@$(MAKE) control-plane
	@$(MAKE) workers

control-plane:
	@$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"

	@echo "👉 [Makefile] Deploying k8s cluster to server"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/bootstrap-control-plane.sh"
	@echo "✅ [Makefile] k8s cluster deployed"

workers:
	@echo "👉 [Makefile] Connecting to worker nodes"
	@$(CURDIR)/scripts/connect-all-workers.sh
	@echo "✅ [Makefile] Worker nodes connected"

services:
	@echo "👉 [Makefile] Deploying k8s services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/upgrade-namespace.sh traefik"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/bootstrap-secrets.sh"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/bootstrap-telemetry.sh"
	@$(MAKE) senaev-com
	@echo "✅ [Makefile] k8s services deployed"

senaev-com:
	@echo "👉 [Makefile] Deploying senaev-com services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/upgrade-namespace.sh senaev-com"
	@echo "✅ [Makefile] senaev-com services deployed"
