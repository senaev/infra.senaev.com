{{- define "senaev-com.llmWorkspace.workspace" -}}
{{- if or .Values.opencode.enabled .Values.ompWeb.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%s-instructions" .Values.name }}
  namespace: {{ .Release.Namespace }}
data:
  AGENTS.md: |
{{ .Files.Get (printf "%s/AGENTS.md" .Values.instructionsPath) | required "Missing workspace AGENTS.md" | indent 4 }}
  CLAUDE.md: |
{{ .Files.Get (printf "%s/CLAUDE.md" .Values.instructionsPath) | required "Missing workspace CLAUDE.md" | indent 4 }}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ printf "%s-projects" .Values.name }}
  namespace: {{ .Release.Namespace }}
  annotations:
    helm.sh/resource-policy: keep
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: {{ .Values.projectsStorageSize }}
{{- end }}
{{- end -}}
