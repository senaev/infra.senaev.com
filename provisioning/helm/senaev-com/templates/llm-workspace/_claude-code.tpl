{{- define "senaev-com.llmWorkspace.claudeCode" -}}
{{- if .Values.claudeCode.enabled }}
{{- $mcpServers := dict }}
{{- range $name, $server := .Values.claudeCode.mcp }}
{{- $_ := set $mcpServers $name (dict "type" "http" "url" $server.url) }}
{{- end }}
{{- $keys := list .Values.git.githubToken .Values.git.sshPrivateKey .Values.claudeCode.telegram.token .Values.claudeCode.telegram.user }}
{{ include "senaev-com.llmWorkspace.componentSecret" (dict "name" (printf "%s-claude-code-env" .Values.name) "namespace" .Release.Namespace "keys" $keys) }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%s-claude-code" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  # One server owns the login and the sessions in the data folder.
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%s-claude-code" .Values.name }}
  template:
    metadata:
      labels:
        app: {{ printf "%s-claude-code" .Values.name }}
        vps: {{ .Values.vps }}
        tags.datadoghq.com/service: claude-code
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ printf "%s-claude-code-env" .Values.name | quote }}
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions" .Values.name | quote }}
    spec:
{{ include "senaev-com.llmWorkspace.podAccess" . | indent 6 }}
      # The pod name changes on each start; Remote Control shows the hostname as the device name.
      hostname: {{ printf "%s-claude-code" .Values.name }}
      nodeSelector:
        vps: {{ .Values.vps }}
      # The SSH key is only in the ssh-agent container: Claude Code signs through its socket.
      initContainers:
{{ include "senaev-com.llmWorkspace.sshAgent.container" . | indent 8 }}
      containers:
        - name: claude-code
          image: ghcr.io/senaev/claude-code:latest
          imagePullPolicy: Always
          securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 12 }}
          # The prompt API of start.sh: POST /run with { "prompt": "..." } runs `claude -p` without
          # approvals and answers with the result when the run ends. Only n8n can reach it.
          ports:
            - name: prompt-api
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /health
              port: prompt-api
            periodSeconds: 10
          resources:
            requests:
              memory: 512Mi
          env:
            # Claude Code refuses to run without approvals as root, except in a sandbox: this container.
            - name: IS_SANDBOX
              value: "1"
            - name: CLAUDE_CODE_MODEL
              value: {{ .Values.claudeCode.model | quote }}
            - name: CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX
              value: {{ .Values.name | quote }}
            # start.sh writes them into the user config; the telegram-login container logs in to them.
            - name: WORKSPACE_MCP_SERVERS
              value: {{ $mcpServers | toJson | quote }}
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
                  name: {{ printf "%s-claude-code-env" $.Values.name }}
                  key: {{ .Values.git.githubToken }}
{{ include "senaev-com.llmWorkspace.sshAgent.env" . | indent 12 }}
          volumeMounts:
            - name: data
              mountPath: /home/claude
{{ include "senaev-com.llmWorkspace.sshAgent.volumeMount" . | indent 12 }}
            - name: code
              mountPath: /code
            # Claude Code reads the CLAUDE.md of a parent folder of /code.
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
              readOnly: true
            - name: instructions
              mountPath: /CLAUDE.md
              subPath: CLAUDE.md
              readOnly: true
        # Logs in to Claude, to the MCP servers and to Codex from Telegram, and warns before the login expires. It has the bot token, so it
        # runs apart from Claude Code, which has no approvals; both share the login in HOME.
        - name: telegram-login
          image: ghcr.io/senaev/claude-code:latest
          imagePullPolicy: Always
          args: ["/app/claude-code/node_modules/.bin/tsx", "/app/claude-code/telegram-login/main.ts"]
          securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 12 }}
          resources:
            requests:
              memory: 128Mi
          env:
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-claude-code-env" $.Values.name }}
                  key: {{ .Values.claudeCode.telegram.token }}
            - name: TELEGRAM_USER_ID
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-claude-code-env" $.Values.name }}
                  key: {{ .Values.claudeCode.telegram.user }}
{{- if .Values.codex.enabled }}
            # The same bot logs Codex in (/codex_auth): `codex login` writes to the login folder
            # of the codex container. Both pods run on the node of the workspace.
            - name: CODEX_HOME
              value: /home/codex/.codex
{{- end }}
          volumeMounts:
            - name: data
              mountPath: /home/claude
{{- if .Values.codex.enabled }}
            - name: codex-data
              mountPath: /home/codex
{{- end }}
      volumes:
        # The login, the trust answers and the session history.
        - name: data
          hostPath:
            path: {{ .Values.global.clusterRootPath }}/volumes/claude-code
            type: DirectoryOrCreate
{{- if .Values.codex.enabled }}
        # The HOME of the codex container (_codex.tpl), for the Codex login only.
        - name: codex-data
          hostPath:
            path: {{ .Values.global.clusterRootPath }}/volumes/codex
            type: DirectoryOrCreate
{{- end }}
{{ include "senaev-com.llmWorkspace.sshAgent.volumes" (dict "context" . "secretName" (printf "%s-claude-code-env" .Values.name)) | indent 8 }}
        - name: code
          persistentVolumeClaim:
            claimName: {{ printf "%s-code" .Values.name }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%s-claude-code" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: {{ printf "%s-claude-code" .Values.name }}
  ports:
    - name: prompt-api
      port: 8080
      targetPort: prompt-api
      protocol: TCP
---
# Remote Control makes outbound connections only. The prompt API has no token and runs
# prompts without approvals: the only ingress is n8n of this namespace, on the API port.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%s-claude-code" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%s-claude-code" .Values.name }}
  policyTypes: [Ingress, Egress]
{{ include "senaev-com.llmWorkspace.egress" . }}
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: n8n
      ports:
        - protocol: TCP
          port: 8080
{{- end }}
{{- end -}}
