{{- define "senaev-com.llmWorkspace.codeTools" -}}
{{- if .Values.codeTools.enabled }}
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
        secret.reloader.stakater.com/reload: "senaev-com-kv-secrets"
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions" .Values.name | quote }}
    spec:
      # ReadWriteOnce permits all workspace pods to mount the projects disk on the same node.
      nodeSelector:
        vps: {{ .Values.vps }}
      initContainers:
        - name: git-init
          image: alpine/git:latest
          command: ["/bin/sh", "-ec"]
          args:
            - |
              cp /tmp/ssh/id_rsa /root/.ssh/id_rsa
              chmod 600 /root/.ssh/id_rsa
              ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null
          volumeMounts:
            - name: ssh-key
              mountPath: /tmp/ssh
              readOnly: true
            - name: ssh-dir
              mountPath: /root/.ssh
      containers:
        - name: code-tools
          image: ghcr.io/senaev/code-tools:latest
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080
          # The commands that the agents run here (npm ci, eslint, tsc, vitest) once took 3.2 GB
          # and froze the node; with a limit, the kernel kills them in this container only.
          resources:
            requests:
              memory: 256Mi
            limits:
              memory: 2Gi
          env:
            - name: CODE_TOOLS_PROJECTS_PATH
              value: /projects
            - name: INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
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
                  name: senaev-com-kv-secrets
                  key: {{ .Values.git.githubToken }}
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
            - name: projects
              mountPath: /projects
            - name: ssh-dir
              mountPath: /root/.ssh
            # The server rules that every code tool description points to.
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
      volumes:
        - name: ssh-key
          secret:
            secretName: senaev-com-kv-secrets
            items:
              - key: {{ .Values.git.sshPrivateKey }}
                path: id_rsa
                mode: 0600
        - name: ssh-dir
          emptyDir: {}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
        - name: projects
          persistentVolumeClaim:
            claimName: {{ printf "%s-projects" .Values.name }}
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
