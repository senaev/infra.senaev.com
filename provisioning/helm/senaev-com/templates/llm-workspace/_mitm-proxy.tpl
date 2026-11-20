{{/* The mitm-proxy sidecar (image mitm-proxy/) holds secret headers for some hosts. The agent
container has placeholders and sends requests through the proxy, which sets the real header
only on a verified TLS connection to the exact host. The agent can use the secret but cannot
read it. Today it holds GH_TOKEN for api.github.com and uploads.github.com.

Parts, used together in one pod:
- container: a native sidecar in initContainers, with the secrets in its own env;
- env, volumeMounts: in the agent container;
- volumes: in the pod;
- configMap: once per workspace, the gh wrapper.
*/}}

{{- define "senaev-com.llmWorkspace.mitmProxy.port" -}}3128{{- end -}}

{{/* host → headers; ${NAME} is an env var of the sidecar. */}}
{{- define "senaev-com.llmWorkspace.mitmProxy.rules" -}}
{{- $github := dict "authorization" "token ${GH_TOKEN}" -}}
{{- dict "api.github.com" $github "uploads.github.com" $github | toJson -}}
{{- end -}}

{{/* .secretName is the component Secret that holds .Values.git.githubToken. */}}
{{- define "senaev-com.llmWorkspace.mitmProxy.container" -}}
- name: mitm-proxy
  image: ghcr.io/senaev/mitm-proxy:latest
  imagePullPolicy: Always
  restartPolicy: Always
  env:
    - name: MITM_RULES
      value: {{ include "senaev-com.llmWorkspace.mitmProxy.rules" . | quote }}
    - name: GH_TOKEN
      valueFrom:
        secretKeyRef:
          name: {{ .secretName }}
          key: {{ .context.Values.git.githubToken }}
  # The port opens after the CA bundle is written, so the agent container starts with it.
  startupProbe:
    tcpSocket:
      port: {{ include "senaev-com.llmWorkspace.mitmProxy.port" . }}
    periodSeconds: 1
    failureThreshold: 60
  securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 4 }}
  resources:
    requests:
      memory: 32Mi
  volumeMounts:
    - name: mitm-proxy
      mountPath: /mitm-proxy
{{- end -}}

{{/* gh accepts any token here; the proxy replaces it. */}}
{{- define "senaev-com.llmWorkspace.mitmProxy.env" -}}
- name: GH_TOKEN
  value: placeholder-mitm-proxy-adds-the-real-token
{{- end -}}

{{/* The CA bundle, read-only, and the gh wrapper before /usr/bin/gh in PATH. */}}
{{- define "senaev-com.llmWorkspace.mitmProxy.volumeMounts" -}}
- name: mitm-proxy
  mountPath: /mitm-proxy
  readOnly: true
- name: mitm-proxy-gh
  mountPath: /usr/local/bin/gh
  subPath: gh
  readOnly: true
{{- end -}}

{{- define "senaev-com.llmWorkspace.mitmProxy.volumes" -}}
- name: mitm-proxy
  emptyDir:
    medium: Memory
    sizeLimit: 2Mi
- name: mitm-proxy-gh
  configMap:
    name: {{ printf "%s-mitm-proxy" .Values.name }}
    defaultMode: 0555
{{- end -}}

{{/* Only gh goes through the proxy, so the rest of the container does not depend on it. */}}
{{- define "senaev-com.llmWorkspace.mitmProxy.configMap" -}}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%s-mitm-proxy" .Values.name }}
  namespace: {{ .Release.Namespace }}
data:
  gh: |
    #!/bin/sh
    # gh through the mitm-proxy sidecar, which adds the real GitHub token. GH_TOKEN here is a
    # placeholder. /usr/bin/gh without this wrapper gets "Bad credentials".
    export HTTPS_PROXY=http://127.0.0.1:{{ include "senaev-com.llmWorkspace.mitmProxy.port" . }}
    export SSL_CERT_FILE=/mitm-proxy/ca-bundle.crt
    unset NO_PROXY no_proxy
    exec /usr/bin/gh "$@"
{{- end -}}
