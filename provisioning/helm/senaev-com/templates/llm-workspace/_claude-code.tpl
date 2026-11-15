{{- define "senaev-com.llmWorkspace.claudeCode" -}}
{{- if .Values.claudeCode.enabled }}
{{- $keys := list .Values.git.githubToken .Values.git.sshPrivateKey }}
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
      containers:
        - name: claude-code
          image: ghcr.io/senaev/claude-code:latest
          imagePullPolicy: Always
          securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 12 }}
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
          volumeMounts:
            - name: data
              mountPath: /home/claude
            - name: ssh
              mountPath: /home/claude/.ssh
              readOnly: true
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
      volumes:
        # The login, the trust answers and the session history.
        - name: data
          hostPath:
            path: {{ .Values.global.clusterRootPath }}/volumes/claude-code
            type: DirectoryOrCreate
        - name: ssh
          secret:
            secretName: {{ printf "%s-claude-code-env" .Values.name }}
            defaultMode: 0600
            items:
              - key: {{ .Values.git.sshPrivateKey }}
                path: id_rsa
        - name: code
          persistentVolumeClaim:
            claimName: {{ printf "%s-code" .Values.name }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
---
# Remote Control makes outbound connections only: no ingress, no Service.
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
{{- end }}
{{- end -}}
