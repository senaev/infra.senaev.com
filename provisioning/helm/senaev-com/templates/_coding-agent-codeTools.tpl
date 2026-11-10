{{- define "senaev-com.codingAgent.codeTools" -}}
{{- if and .Values.opencode.enabled .Values.codeTools.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%scode-tools" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  # One operation manager owns the shared working trees; upgrades still have a short outage.
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%scode-tools" .Values.resourcePrefix }}
  template:
    metadata:
      labels:
        app: {{ printf "%scode-tools" .Values.resourcePrefix }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: code-tools
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ .Values.secrets.name | quote }}
        configmap.reloader.stakater.com/reload: {{ list (printf "%sopencode-telegram-config" .Values.resourcePrefix) | join "," | quote }}
    spec:
      # ReadWriteOnce permits both pods to mount the existing disk on the same node.
      nodeSelector:
        vps: {{ .Values.opencode.vps }}
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
              topologyKey: kubernetes.io/hostname
      initContainers:
        - name: git-init
          image: alpine/git:latest
          command: ["/bin/sh", "-ec"]
          args:
            - |
              mkdir -p /root/.ssh
              cp /tmp/ssh/id_rsa /root/.ssh/id_rsa
              chmod 600 /root/.ssh/id_rsa
              ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null
              mkdir -p /projects/git
          volumeMounts:
            - name: ssh-key
              mountPath: /tmp/ssh
              readOnly: true
            - name: ssh-dir
              mountPath: /root/.ssh
            - name: projects-git
              mountPath: /projects/git
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
              value: /projects/git
            - name: INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ required "Code Tools requires secrets.codeToolsToken" .Values.secrets.codeToolsToken }}
            - name: GIT_AUTHOR_NAME
              value: {{ .Values.owner.name | quote }}
            - name: GIT_AUTHOR_EMAIL
              value: {{ .Values.owner.email | quote }}
            - name: GIT_COMMITTER_NAME
              value: {{ .Values.owner.name | quote }}
            - name: GIT_COMMITTER_EMAIL
              value: {{ .Values.owner.email | quote }}
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ .Values.secrets.githubToken }}
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
            - name: projects-git
              mountPath: /projects/git
            - name: ssh-dir
              mountPath: /root/.ssh
            # The server rules that every code tool description points to.
            - name: opencode-config
              mountPath: /AGENTS.md
              subPath: AGENTS.md
      volumes:
        - name: ssh-key
          secret:
            secretName: {{ $.Values.secrets.name }}
            items:
              - key: {{ .Values.secrets.sshPrivateKey }}
                path: id_rsa
                mode: 0600
        - name: ssh-dir
          emptyDir: {}
        - name: opencode-config
          configMap:
            name: {{ printf "%sopencode-telegram-config" .Values.resourcePrefix }}
        - name: projects-git
          persistentVolumeClaim:
            claimName: {{ printf "%sopencode-telegram-git" .Values.resourcePrefix }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%scode-tools" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  selector:
    app: {{ printf "%scode-tools" .Values.resourcePrefix }}
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
  name: {{ printf "%scode-tools" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%scode-tools" .Values.resourcePrefix }}
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
