{{- define "senaev-com.llmWorkspace.codex" -}}
{{- if .Values.codex.enabled }}
{{- $keys := list .Values.git.githubToken .Values.git.sshPrivateKey }}
{{ include "senaev-com.llmWorkspace.componentSecret" (dict "name" (printf "%s-codex-env" .Values.name) "namespace" .Release.Namespace "keys" $keys) }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%s-codex" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  # One server owns the login and the remote control enrollment in the data folder.
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%s-codex" .Values.name }}
  template:
    metadata:
      labels:
        app: {{ printf "%s-codex" .Values.name }}
        vps: {{ .Values.vps }}
        tags.datadoghq.com/service: codex
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ printf "%s-codex-env" .Values.name | quote }}
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions" .Values.name | quote }}
    spec:
{{ include "senaev-com.llmWorkspace.podAccess" . | indent 6 }}
      # The pod name changes on each start; remote control shows the hostname as the device name.
      hostname: {{ printf "%s-codex" .Values.name }}
      nodeSelector:
        vps: {{ .Values.vps }}
      # The SSH key is only in the ssh-agent container: Codex signs through its socket.
      initContainers:
{{ include "senaev-com.llmWorkspace.sshAgent.container" . | indent 8 }}
      containers:
        - name: codex
          image: ghcr.io/senaev/codex:latest
          imagePullPolicy: Always
          securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 12 }}
          resources:
            requests:
              memory: 512Mi
          env:
            - name: CODEX_REMOTE_CONTROL
              value: {{ .Values.codex.remoteControl | quote }}
            - name: CODEX_AUTO_COMPACT_TOKEN_LIMIT
              value: {{ required "codex.autoCompactTokenLimit is required" .Values.codex.autoCompactTokenLimit | quote }}
            # Without it the server prints only "the connection is errored", not why. The remote
            # control module logs each connection attempt and its error at info.
            - name: RUST_LOG
              value: "warn,codex_app_server_transport::transport::remote_control=info"
            - name: GIT_AUTHOR_NAME
              value: {{ .Values.git.name | quote }}
            - name: GIT_AUTHOR_EMAIL
              value: {{ .Values.git.email | quote }}
            - name: GIT_COMMITTER_NAME
              value: {{ .Values.git.name | quote }}
            - name: GIT_COMMITTER_EMAIL
              value: {{ .Values.git.email | quote }}
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-codex-env" $.Values.name }}
                  key: {{ .Values.git.githubToken }}
{{ include "senaev-com.llmWorkspace.sshAgent.env" . | indent 12 }}
          volumeMounts:
            - name: data
              mountPath: /home/codex
{{ include "senaev-com.llmWorkspace.sshAgent.volumeMount" . | indent 12 }}
            - name: code
              mountPath: /code
{{- if .Values.codex.remoteControl }}
            # The daemon binds its control socket here, and CODEX_HOME has only a symlink to it:
            # the Telegram helper of the claude-code pod mounts the same folder to reach it.
            - name: daemon-socket
              mountPath: /tmp/codex-daemon-0
{{- end }}
            # start.sh links it as ~/.codex/AGENTS.md: Codex does not read the AGENTS.md of a
            # parent folder of /code, which is not a repository.
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
              readOnly: true
      volumes:
        # CODEX_HOME (~/.codex): the login, the remote control enrollment and the session history.
        - name: data
          hostPath:
            path: {{ .Values.global.clusterRootPath }}/volumes/codex
            type: DirectoryOrCreate
{{ include "senaev-com.llmWorkspace.sshAgent.volumes" (dict "context" . "secretName" (printf "%s-codex-env" .Values.name)) | indent 8 }}
{{- if .Values.codex.remoteControl }}
        # /tmp/codex-daemon-<uid> of the daemon (codex-rs/uds); start.sh makes it 0700.
        - name: daemon-socket
          hostPath:
            path: {{ .Values.global.clusterRootPath }}/volumes/codex-daemon-socket
            type: DirectoryOrCreate
{{- end }}
{{ include "senaev-com.llmWorkspace.codeVolume" . | indent 8 }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
---
# Remote control makes outbound connections only: no ingress, no Service.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%s-codex" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%s-codex" .Values.name }}
  policyTypes: [Ingress, Egress]
{{ include "senaev-com.llmWorkspace.egress" . }}
{{- end }}
{{- end -}}
