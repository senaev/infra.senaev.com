{{/* Only requested Vault properties enter each component's Kubernetes Secret.
This limits whole-Secret exposure to the node; applications already use key refs.
*/}}
{{- define "senaev-com.llmWorkspace.componentSecret" -}}
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ .name }}
  namespace: {{ .namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: vault-cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: {{ .name }}
    creationPolicy: Owner
  data:
{{- range .keys | uniq | sortAlpha }}
    - secretKey: {{ . | quote }}
      remoteRef:
        key: senaev-com-kv
        property: {{ . | quote }}
{{- end }}
{{- end -}}
