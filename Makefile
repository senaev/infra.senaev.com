SCRIPT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

.PHONY: deploy rsync deploy-k8s

deploy:
	@echo "👉 Starting deployment to production server"
	@$(MAKE) rsync
	@$(MAKE) deploy-k8s
	@echo "🏁 Deployment completed successfully!"

rsync:
	@echo "👉 Syncing provisioning files to server"
	@set -a && . "$(SCRIPT_DIR)provisioning/k8s/scripts/.env" && set +a && \
	 set -a && . "$(SCRIPT_DIR).env" && set +a && \
	 ssh "$$REMOTE_SERVER_ADDRESS" "mkdir -p $$K3S_CLUSTER_PATH" && \
	 rsync -avz --delete -e ssh "$(SCRIPT_DIR)provisioning/" "$$REMOTE_SERVER_ADDRESS:$$PROVISIONING_PATH/"
	@echo "✅ Provisioning files synced"

deploy-k8s:
	@echo "👉 Deploying k8s cluster to server" && \
	set -a && . "$(SCRIPT_DIR)provisioning/k8s/scripts/.env" && set +a && \
	set -a && . "$(SCRIPT_DIR).env" && set +a && \
	ssh "$$REMOTE_SERVER_ADDRESS" "$$PROVISIONING_PATH/k8s/scripts/deploy-k8s.sh" && \
	echo "✅ k8s cluster deployed to server"
