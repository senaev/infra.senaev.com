{{/* Env of both containers that run config/mcp-grafana/create-service-account-token.mjs. */}}
{{- define "senaev-com.mcpGrafanaTokenEnv" -}}
- name: GRAFANA_URL
  value: {{ .Values.mcpGrafana.grafanaUrl | quote }}
- name: GRAFANA_ADMIN_USER
  value: {{ .Values.grafanaAdminUser | quote }}
- name: GRAFANA_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
      name: senaev-com-kv-secrets
      key: GRAFANA_ADMIN_PASSWORD
      optional: false
- name: SERVICE_ACCOUNT_NAME
  value: mcp-grafana
- name: SERVICE_ACCOUNT_ROLE
  value: Editor
- name: TOKEN_FILE
  value: /grafana-token/token
{{- end -}}
