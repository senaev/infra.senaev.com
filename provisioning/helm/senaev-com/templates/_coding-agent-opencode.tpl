{{- define "senaev-com.codingAgent.opencode" -}}
{{- $agent := .Values.agent }}
{{- if .Values.opencode.enabled }}
{{- $oauth := .Values.opencode.mcpOAuth }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%sopencode-telegram-config" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
data:
  AGENTS.md: |
{{ .Files.Get (printf "%s/AGENTS.md" .Values.instructionsPath) | required "Missing instance AGENTS.md" | indent 4 }}
  CLAUDE.md: |
{{ .Files.Get (printf "%s/CLAUDE.md" .Values.instructionsPath) | required "Missing instance CLAUDE.md" | indent 4 }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  template:
    metadata:
      labels:
        app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: opencode-telegram
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        checksum/mcp-oauth-proxy: {{ include "senaev-com.opencodeMcpOAuthNginx" . | sha256sum }}
        secret.reloader.stakater.com/reload: {{ printf "%s,%sopencode-auth" .Values.secrets.name .Values.resourcePrefix | quote }}
        configmap.reloader.stakater.com/reload: {{ list (printf "%sopencode-telegram-config" .Values.resourcePrefix) | join "," | quote }}
    spec:
      nodeSelector:
        vps: {{ .Values.opencode.vps }}
      initContainers:
        - name: git-init
          image: alpine/git:latest
          command: ["/bin/sh", "-c"]
          args:
            - |
              git config --global user.name "$GIT_AUTHOR_NAME"
              git config --global user.email "$GIT_AUTHOR_EMAIL"
              mkdir -p /root/.ssh
              cp /tmp/ssh/id_rsa /root/.ssh/id_rsa
              chmod 600 /root/.ssh/id_rsa
              ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null
              mkdir -p /projects/git
          env:
            - name: GIT_AUTHOR_NAME
              value: {{ .Values.owner.name | quote }}
            - name: GIT_AUTHOR_EMAIL
              value: {{ .Values.owner.email | quote }}
          volumeMounts:
            - name: ssh-key
              mountPath: /tmp/ssh
              readOnly: true
            - name: ssh-dir
              mountPath: /root/.ssh
            - name: projects-git
              mountPath: /projects/git
      containers:
        # OpenCode web and API share native authentication; the bot uses localhost.
        - name: opencode-serve
          image: ghcr.io/senaev/opencode-serve:latest
          imagePullPolicy: Always
          ports:
            - name: opencode
              containerPort: 4096
          # The agent runs heavy commands here too; see the same limit in code-tools.yaml.
          resources:
            requests:
              memory: 512Mi
            limits:
              memory: 2Gi
          startupProbe:
            exec:
              command: ["opencode", "--server", "http://127.0.0.1:4096", "api", "get", "/api/info"]
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 60
          readinessProbe:
            exec:
              command: ["opencode", "--server", "http://127.0.0.1:4096", "api", "get", "/api/info"]
            periodSeconds: 10
            timeoutSeconds: 5
          livenessProbe:
            exec:
              command: ["opencode", "--server", "http://127.0.0.1:4096", "api", "get", "/api/info"]
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 6
          env:
            - name: OPENCODE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%sopencode-auth" .Values.resourcePrefix }}
                  key: password
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
                  optional: false
            - name: OPENCODE_WORKDIR
              value: /projects/git
{{- range $connector := $agent.connectors }}
            - name: {{ $connector.apiKeyEnv | quote }}
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ default $connector.apiKeyEnv $connector.secretKey | quote }}
{{- end }}
            - name: OPENCODE_CONFIG_CONTENT
{{- $servers := dict }}
{{- range $name, $server := $agent.mcp }}
{{- $remote := merge (dict "type" "remote") (deepCopy $server) }}
{{- $_ := set $remote "oauth" (merge (dict "redirect_uri" (printf "https://%s/auth/mcp/callback" $.Values.opencode.mcpOAuth.hostname) "callback_port" $.Values.opencode.mcpOAuth.callbackPort) $remote.oauth) }}
{{- $_ := set $servers $name $remote }}
{{- end }}
{{- $providers := dict }}
{{- range $name, $connector := $agent.connectors }}
{{- $_ := set $providers $name (dict "npm" "@ai-sdk/openai-compatible" "name" $name "options" (dict "baseURL" $connector.baseUrl "apiKey" (printf "{env:%s}" $connector.apiKeyEnv))) }}
{{- end }}
              value: {{ dict "mcp" (dict "servers" $servers) "model" (printf "%s/%s" $agent.defaultModel.provider $agent.defaultModel.id) "provider" $providers "permissions" (list (dict "action" "external_directory" "resource" "*" "effect" "ask")) | toJson | quote }}
          volumeMounts:
            - name: projects-git
              mountPath: /projects/git
            - name: ssh-dir
              mountPath: /root/.ssh
            - name: opencode-data
              mountPath: /root/.local/share/opencode
              subPath: opencode-sessions
            - name: opencode-data
              mountPath: /root/.config/opencode
              subPath: opencode-config
            - name: opencode-data
              mountPath: /root/.local/state/opencode
              subPath: opencode-state
            - name: opencode-config
              mountPath: /root/.config/opencode/AGENTS.md
              subPath: AGENTS.md
            - name: opencode-config
              mountPath: /AGENTS.md
              subPath: AGENTS.md
            - name: opencode-config
              mountPath: /CLAUDE.md
              subPath: CLAUDE.md

        - name: mcp-oauth-proxy
          image: nginxinc/nginx-unprivileged:1.28.0-alpine
          command: ["nginx", "-g", "daemon off;"]
          ports:
            - name: mcp-oauth
              containerPort: 8081
          securityContext:
            runAsNonRoot: true
            runAsUser: 101
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              memory: 16Mi
            limits:
              memory: 64Mi
          readinessProbe:
            httpGet:
              path: /healthz
              port: mcp-oauth
          volumeMounts:
            - name: mcp-oauth-proxy
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
              readOnly: true
            - name: mcp-oauth-tmp
              mountPath: /tmp

        - name: opencode-telegram-bot
          image: ghcr.io/senaev/opencode-telegram-bot:latest
          imagePullPolicy: Always
          volumeMounts:
            - name: projects-git
              mountPath: /projects/git
            - name: opencode-data
              mountPath: /root/.config/opencode-telegram-bot
              subPath: telegram-bot
            - name: opencode-config
              mountPath: /AGENTS.md
              subPath: AGENTS.md
            - name: opencode-config
              mountPath: /CLAUDE.md
              subPath: CLAUDE.md
          env:
            - name: OPENCODE_SERVER_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%sopencode-auth" .Values.resourcePrefix }}
                  key: password
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ .Values.secrets.telegramToken }}
                  optional: false
            - name: TELEGRAM_ALLOWED_USER_ID
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ .Values.secrets.telegramAllowedUser }}
                  optional: false
            - name: OPENCODE_API_URL
              value: "http://localhost:4096"
            - name: OPENCODE_MODEL_PROVIDER
              value: {{ $agent.defaultModel.provider | quote }}
            - name: OPENCODE_MODEL_ID
              value: {{ $agent.defaultModel.id | quote }}
            - name: OPEN_BROWSER_ROOTS
              value: /projects/git
            - name: STT_API_URL
              value: {{ $agent.speechToText.baseUrl | quote }}
            - name: STT_API_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ default $agent.speechToText.apiKeyEnv $agent.speechToText.secretKey | quote }}
                  optional: false
            - name: STT_MODEL
              value: {{ $agent.speechToText.model | quote }}

      volumes:
        - name: mcp-oauth-proxy
          configMap:
            name: {{ printf "%sopencode-mcp-oauth" .Values.resourcePrefix }}
        - name: mcp-oauth-tmp
          emptyDir: {}
        - name: opencode-data
          hostPath:
            path: {{ .Values.opencode.dataPath }}
            type: DirectoryOrCreate
        - name: ssh-key
          secret:
            secretName: {{ $.Values.secrets.name }}
            items:
              - key: {{ .Values.secrets.sshPrivateKey }}
                path: id_rsa
                mode: 0600
        - name: ssh-dir
          emptyDir: {}
        - name: projects-git
          persistentVolumeClaim:
            claimName: {{ printf "%sopencode-telegram-git" .Values.resourcePrefix }}
        - name: opencode-config
          configMap:
            name: {{ printf "%sopencode-telegram-config" .Values.resourcePrefix }}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ printf "%sopencode-telegram-git" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: {{ .Values.opencode.projectsStorageSize }}
---
# Only the existing HTTPS ingress controller can reach the web/API port.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ .Values.ingress.namespace }}
          podSelector:
            matchLabels:
              app: traefik
              traefik-deployment: {{ .Values.ingress.traefikDeployment }}
      ports:
        - protocol: TCP
          port: 4096
        - protocol: TCP
          port: 8081
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%sopencode" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  ports:
    - name: http
      port: 4096
      targetPort: opencode
---
# Isolate a missing new Vault property from the existing shared application secret.
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ printf "%sopencode-auth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: {{ .Values.secrets.storeName }}
    kind: {{ .Values.secrets.storeKind }}
  target:
    name: {{ printf "%sopencode-auth" .Values.resourcePrefix }}
    creationPolicy: Owner
  data:
    - secretKey: password
      remoteRef:
        key: {{ .Values.secrets.vaultPath }}
        property: {{ .Values.secrets.opencodePassword }}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%sopencode-mcp-oauth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
data:
  nginx.conf: |
{{ include "senaev-com.opencodeMcpOAuthNginx" . | indent 4 }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%sopencode-mcp-oauth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
  ports:
    - name: http
      port: 8081
      targetPort: mcp-oauth
---
# Callback only: OpenCode validates OAuth state and exchanges the code with PKCE.
# Native web/API authentication remains on the existing port 4096 ingress.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ printf "%sopencode-mcp-oauth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: {{ .Values.ingress.entrypoints }}
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: {{ .Values.ingress.certResolver }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  tls:
    - hosts: [{{ $oauth.hostname | quote }}]
  rules:
    - host: {{ $oauth.hostname | quote }}
      http:
        paths:
          - path: /auth/mcp/callback
            pathType: Exact
            backend:
              service:
                name: {{ printf "%sopencode-mcp-oauth" .Values.resourcePrefix }}
                port:
                  number: 8081
{{- end }}
{{- if .Values.opencode.enabled }}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Values.opencode.ingressName }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: {{ .Values.ingress.entrypoints }}
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: {{ .Values.ingress.certResolver }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  tls:
    - hosts: [{{ .Values.opencode.hostname | quote }}]
  rules:
    - host: {{ .Values.opencode.hostname | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ printf "%sopencode" .Values.resourcePrefix }}
                port:
                  number: 4096
{{- end }}
{{- end -}}
{{- define "senaev-com.opencodeMcpOAuthNginx" -}}
worker_processes 1;
pid /tmp/nginx.pid;
# Callback request URIs contain authorization codes: never log them.
error_log /dev/stderr crit;
events { worker_connections 128; }
http {
  access_log off;
  client_body_temp_path /tmp/client_temp;
  proxy_temp_path /tmp/proxy_temp;
  fastcgi_temp_path /tmp/fastcgi_temp;
  uwsgi_temp_path /tmp/uwsgi_temp;
  scgi_temp_path /tmp/scgi_temp;
  server {
    listen 8081;
    server_name _;
    location = /healthz { return 200 'ok'; }
    location = /auth/mcp/callback {
      limit_except GET { deny all; }
      proxy_pass http://127.0.0.1:{{ .Values.opencode.mcpOAuth.callbackPort }};
      proxy_set_header Host 127.0.0.1;
      proxy_set_header Authorization "";
      proxy_set_header Cookie "";
      proxy_connect_timeout 2s;
      proxy_read_timeout 60s;
      add_header Cache-Control "no-store" always;
      add_header Referrer-Policy "no-referrer" always;
    }
    location / { return 404; }
  }
}
{{- end -}}
