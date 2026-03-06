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

rsync:
	@echo "👉 [Makefile] Rsyncing provisioning files to server"
	@$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"
	@echo "✅ [Makefile] Provisioning files synced"

control-plane:
	@$(MAKE) rsync

	@echo "👉 [Makefile] Deploying k8s cluster to server"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/scripts/bootstrap-control-plane.sh"
	@echo "✅ [Makefile] k8s cluster deployed"

workers:
	@echo "👉 [Makefile] Connecting to worker nodes"
	@$(CURDIR)/scripts/connect-all-workers.sh
	@echo "✅ [Makefile] Worker nodes connected"

services:
	@$(MAKE) rsync

	@echo "👉 [Makefile] Deploying k8s services on control-plane=[$(CONTROL_PLANE_SERVER_ADDRESS)]"
	@ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "~/k3s-cluster/provisioning/control-plane/scripts/bootstrap-services.sh"
	@echo "✅ [Makefile] k8s services deployed"
