SCRIPT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

include $(SCRIPT_DIR)env.mk

.PHONY: deploy rsync deploy-k8s

PROVISIONING_ENV := $(SCRIPT_DIR)provisioning/k8s/scripts/.env

deploy:
	@echo "👉 Starting deployment to production server"
	@$(MAKE) rsync
	@$(MAKE) deploy-k8s
	@echo "🏁 Deployment completed successfully!"

rsync:
	@set -a && . "$(PROVISIONING_ENV)" && set +a && \
	echo "👉 Syncing provisioning files to server" && \
	ssh "$(REMOTE_SERVER_ADDRESS)" "mkdir -p $$K3S_CLUSTER_PATH" && \
	rsync -avz --delete -e ssh "$(SCRIPT_DIR)provisioning/" "$(REMOTE_SERVER_ADDRESS):$$PROVISIONING_PATH/"
	@echo "✅ Provisioning files synced"

deploy-k8s:
	@set -a && . "$(PROVISIONING_ENV)" && set +a && \
	echo "👉 Deploying k8s cluster to server" && \
	ssh "$(REMOTE_SERVER_ADDRESS)" "$$PROVISIONING_PATH/k8s/scripts/deploy-k8s.sh"
	@echo "✅ k8s cluster deployed to server"
