# k8s cluster deployment (runs on the server)
# Env: .env in this directory

.ONESHELL:
SHELL := /bin/bash

SCRIPTS_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ROOT_DIR := $(patsubst %/,%,$(SCRIPTS_DIR))

.PHONY: deploy install-k3s kube-config wait-eso deploy-vault wait-vm-operator
.PHONY: upgrade-traefik upgrade-external-secrets upgrade-vault
.PHONY: upgrade-vm-operator upgrade-vm-stack upgrade-senaev-com

# Load env and run upgrade for a namespace ($1 = namespace name)
define upgrade_ns
	set -a && . "$(ROOT_DIR)/.env" && set +a && \
	ns="$(1)" && \
	echo "👉 Checking namespace=[$$ns]" && \
	kubectl create namespace "$$ns" --dry-run=client -o yaml | kubectl apply -f - && \
	echo "✅ Namespace=[$$ns] exists" && \
	echo "👉 Updating Helm dependencies for namespace=[$$ns]" && \
	helm dependency update "$$PROVISIONING_PATH/k8s/helm/$$ns" || true && \
	echo "✅ Helm dependencies updated for namespace=[$$ns]" && \
	echo "👉 Helm upgrade namespace=[$$ns]" && \
	helm upgrade --install "$$ns" "$$PROVISIONING_PATH/k8s/helm/$$ns" -n "$$ns" -f "$$PROVISIONING_PATH/k8s/helm/$$ns/values.yaml" --take-ownership && \
	echo "✅ Helm upgrade namespace=[$$ns]"
endef

deploy: install-k3s kube-config \
	upgrade-traefik upgrade-external-secrets \
	wait-eso upgrade-vault deploy-vault \
	upgrade-vm-operator wait-vm-operator \
	upgrade-vm-stack upgrade-senaev-com

install-k3s:
	@if command -v k3s >/dev/null 2>&1; then \
		echo "✅ k3s already installed"; \
	else \
		echo "👉 k3s not found, installing..." && \
		curl -sfL https://get.k3s.io | \
		INSTALL_K3S_EXEC=" server --disable traefik --write-kubeconfig-mode 644 --node-label node=control-plane --node-label location=de " sh - && \
		echo "✅ k3s installed"; \
	fi

kube-config:
	@mkdir -p ~/.kube && \
	if [ ! -e ~/.kube/config ]; then \
		echo "👉 Making symlink to 'rancher' from a default 'kubectl' config (for 'k9s')"; \
		ln -sf /etc/rancher/k3s/k3s.yaml ~/.kube/config; \
		echo "✅ Symlink made"; \
	else \
		echo "✅ Symlink to 'rancher' already exists"; \
	fi

upgrade-traefik:
	@$(call upgrade_ns,traefik)

upgrade-external-secrets:
	@$(call upgrade_ns,external-secrets)

wait-eso:
	@set -a && . "$(ROOT_DIR)/.env" && set +a && \
	echo "👉 Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)" && \
	kubectl rollout status deployment/external-secrets-webhook -n "$$EXTERNAL_SECRETS_NS" --timeout=120s && \
	echo "✅ ESO webhook ready"

upgrade-vault:
	@$(call upgrade_ns,vault)

deploy-vault:
	@echo "👉 Deploying vault" && \
	"$(ROOT_DIR)/deploy-vault.sh" && \
	echo "✅ Vault deployed"

upgrade-vm-operator:
	@$(call upgrade_ns,vm-operator)

wait-vm-operator:
	@set -a && . "$(ROOT_DIR)/.env" && set +a && \
	echo "👉 Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)" && \
	kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n "$$VICTORIA_METRICS_OPERATOR_NS" --timeout=120s && \
	echo "✅ Victoria Metrics Operator webhook ready"

upgrade-vm-stack:
	@$(call upgrade_ns,vm-stack)

upgrade-senaev-com:
	@$(call upgrade_ns,senaev-com)
