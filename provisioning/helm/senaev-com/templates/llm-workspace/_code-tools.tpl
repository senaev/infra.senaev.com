{{- define "senaev-com.llmWorkspace.codeTools" -}}
{{- if .Values.codeTools.enabled }}
{{- $keys := list .Values.git.githubToken .Values.git.sshPrivateKey }}
{{ include "senaev-com.llmWorkspace.componentSecret" (dict "name" (printf "%s-code-tools-env" .Values.name) "namespace" .Release.Namespace "keys" $keys) }}
---
# The code-tools server certificate. Its DNS name must match the host in
# cluster-helper/src/mtlsServiceUrls.ts.
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: {{ printf "%s-code-tools-tls" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  secretName: {{ printf "%s-code-tools-tls" .Values.name }}
  dnsNames:
    - {{ printf "%s-code-tools.%s.svc.cluster.local" .Values.name .Release.Namespace }}
  usages:
    - digital signature
    - server auth
  {{- toYaml .Values.global.internalMtlsCertificate | nindent 2 }}
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
            # Plain HTTP with only /health, for the kubelet, which cannot present a certificate.
            - name: health
              containerPort: 8081
            # The tool routes, behind mTLS.
            - name: mtls
              containerPort: 8443
          resources:
            requests:
              memory: 256Mi
          env:
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
              port: health
            periodSeconds: 2
            failureThreshold: 60
          readinessProbe:
            httpGet:
              path: /health
              port: health
            periodSeconds: 5
          volumeMounts:
            - name: code
              mountPath: /code
            # The whole directory, never subPath or env: only a directory mount follows renewals.
            # The path is MTLS_DIRECTORY in senaev-utils, which the service reads. The shell
            # tools run in this container, so they can read the key of the server (accepted).
            - name: mtls
              mountPath: /etc/mtls
              readOnly: true
{{ include "senaev-com.llmWorkspace.sshAgent.volumeMount" . | indent 12 }}
            # The server rules that every code tool description points to.
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
      volumes:
{{ include "senaev-com.llmWorkspace.sshAgent.volumes" (dict "context" . "secretName" (printf "%s-code-tools-env" .Values.name)) | indent 8 }}
        - name: mtls
          secret:
            secretName: {{ printf "%s-code-tools-tls" .Values.name }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
{{ include "senaev-com.llmWorkspace.codeVolume" . | indent 8 }}
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
    - name: mtls
      port: 8443
      targetPort: mtls
      protocol: TCP
---
# Full-shell access remains limited to cluster-helper, which the server also allows by the name
# in its client certificate. The health port 8081 has no rule: only the kubelet uses it.
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
          port: 8443
{{- end }}
{{- end -}}
