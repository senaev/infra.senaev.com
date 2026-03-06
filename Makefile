-include .env
export

CONTROL_PLANE_SERVER_ADDRESS := $(CONTROL_PLANE_SERVER_USERNAME)@$(CONTROL_PLANE_SERVER_IP)

.PHONY: default

default:
	# @echo "👉 [make] Starting deployment to server=[$(CONTROL_PLANE_SERVER_ADDRESS)] workers=[$(WORKERS)]"
	# @echo "👉 [make] Rsyncing provisioning files to server"
	# @$(CURDIR)/scripts/rsync-provisioning.sh "$(CONTROL_PLANE_SERVER_ADDRESS)"
	# @echo "✅ [make] Provisioning files synced"
	# @echo "👉 [make] Deploying k8s cluster to server"
	# @ssh "$(CONTROL_PLANE_SERVER_ADDRESS)" "$(PROVISIONING_PATH_LOCAL_TO_REMOTE)/control-plane/scripts/bootstrap-control-plane.sh"
	# @echo "✅ [make] k8s cluster deployed"
	@echo "👉 [make] Connecting to worker nodes"
	@$(CURDIR)/scripts/connect-all-workers.sh
	@echo "✅ [make] Worker nodes connected"
	@echo "✅ [make] Deployment completed successfully!"
