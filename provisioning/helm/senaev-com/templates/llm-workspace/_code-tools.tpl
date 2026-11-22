{{- define "senaev-com.llmWorkspace.codeTools" -}}
{{- if .Values.codeTools.enabled }}
{{- $keys := list .Values.git.githubToken .Values.git.sshPrivateKey .Values.codeTools.secrets.codeToolsToken }}
{{ include "senaev-com.llmWorkspace.componentSecret" (dict "name" (printf "%s-code-tools-env" .Values.name) "namespace" .Release.Namespace "keys" $keys) }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%s-code-tools" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  # One operation manager owns the shared working trees; upgrades still have a short outage.
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%s-code-tools" .Values.name }}
  template:
    metadata:
      labels:
        app: {{ printf "%s-code-tools" .Values.name }}
        vps: {{ .Values.vps }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: code-tools
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ printf "%s-code-tools-env" .Values.name | quote }}
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions" .Values.name | quote }}
    spec:
{{ include "senaev-com.llmWorkspace.podAccess" . | indent 6 }}
      # ReadWriteOnce permits all workspace pods to mount the code disk on the same node.
      nodeSelector:
        vps: {{ .Values.vps }}
      # The SSH key is only in the ssh-agent container: Code Tools signs through its socket.
      initContainers:
{{ include "senaev-com.llmWorkspace.sshAgent.container" . | indent 8 }}
      containers:
        - name: code-tools
          securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 12 }}
          image: ghcr.io/senaev/code-tools:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080
          resources:
            requests:
              memory: 256Mi
          env:
            - name: INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-code-tools-env" $.Values.name }}
                  key: {{ .Values.codeTools.secrets.codeToolsToken }}
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
                  name: {{ printf "%s-code-tools-env" $.Values.name }}
                  key: {{ .Values.git.githubToken }}
{{ include "senaev-com.llmWorkspace.sshAgent.env" . | indent 12 }}
          startupProbe:
            httpGet:
              path: /health
              port: http
            periodSeconds: 2
            failureThreshold: 60
          readinessProbe:
            httpGet:
              path: /health
              port: http
            periodSeconds: 5
          volumeMounts:
            - name: code
              mountPath: /code
{{ include "senaev-com.llmWorkspace.sshAgent.volumeMount" . | indent 12 }}
            # The server rules that every code tool description points to.
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
      volumes:
{{ include "senaev-com.llmWorkspace.sshAgent.volumes" (dict "context" . "secretName" (printf "%s-code-tools-env" .Values.name)) | indent 8 }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
        - name: code
          persistentVolumeClaim:
            claimName: {{ printf "%s-code" .Values.name }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%s-code-tools" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: {{ printf "%s-code-tools" .Values.name }}
  ports:
    - name: http
      port: 8080
      targetPort: http
      protocol: TCP
---
# Full-shell access remains limited to cluster-helper, with the internal token as well.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%s-code-tools" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%s-code-tools" .Values.name }}
  policyTypes:
    - Ingress
    - Egress
{{ include "senaev-com.llmWorkspace.egress" . }}
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: cluster-helper
      ports:
        - protocol: TCP
          port: 8080
{{- end }}
{{- end -}}
