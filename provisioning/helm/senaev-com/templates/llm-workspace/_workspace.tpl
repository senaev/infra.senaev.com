{{- define "senaev-com.llmWorkspace.workspace" -}}
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
{{- end -}}

{{/* The /code volume of every coding component of the workspace: a folder on its node, shared by
the pods through the workspace node selector. */}}
{{- define "senaev-com.llmWorkspace.codeVolume" -}}
- name: code
  hostPath:
    path: {{ printf "%s/volumes/%s-code" .Values.global.clusterRootPath .Values.name }}
    type: DirectoryOrCreate
{{- end -}}
