{{- define "senaev-com.llmWorkspace.opencode" -}}
{{- $agent := .Values.agent }}
{{- if .Values.opencode.enabled }}
{{- $oauth := .Values.opencode.mcpOAuth }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%s-opencode-telegram" .Values.name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: {{ printf "%s-opencode-telegram" .Values.name }}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%s-opencode-telegram" .Values.name }}
  template:
    metadata:
      labels:
        app: {{ printf "%s-opencode-telegram" .Values.name }}
        vps: {{ .Values.vps }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: opencode-telegram
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ printf "senaev-com-kv-secrets,%s-opencode-auth" .Values.name | quote }}
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions,%s-opencode-mcp-oauth" .Values.name .Values.name | quote }}
    spec:
      nodeSelector:
        vps: {{ .Values.vps }}
      initContainers:
        - name: git-init
          image: alpine/git:latest
          command: ["/bin/sh", "-c"]
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
        # OpenCode web and API share native authentication; the bot uses localhost.
        - name: opencode-serve
          image: ghcr.io/senaev/opencode-serve:latest
          imagePullPolicy: Always
          ports:
            - name: opencode
              containerPort: 4096
          # The agent runs heavy commands here too; see the same limit in _code-tools.tpl.
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
                  name: {{ printf "%s-opencode-auth" .Values.name }}
                  key: password
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
            - name: OPENCODE_WORKDIR
              value: /projects
{{- range $connector := $agent.connectors }}
            - name: {{ $connector.secretKey | quote }}
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: {{ $connector.secretKey | quote }}
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
{{- $_ := set $providers $name (dict "npm" "@ai-sdk/openai-compatible" "name" $name "options" (dict "baseURL" $connector.baseUrl "apiKey" (printf "{env:%s}" $connector.secretKey))) }}
{{- end }}
              value: {{ dict "mcp" (dict "servers" $servers) "model" (printf "%s/%s" $agent.defaultModel.provider $agent.defaultModel.id) "provider" $providers "permissions" (list (dict "action" "external_directory" "resource" "*" "effect" "ask")) | toJson | quote }}
          volumeMounts:
            - name: projects
              mountPath: /projects
            - name: code
              mountPath: /code
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
            - name: instructions
              mountPath: /root/.config/opencode/AGENTS.md
              subPath: AGENTS.md
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
            - name: instructions
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
            - name: projects
              mountPath: /projects
            - name: code
              mountPath: /code
            - name: opencode-data
              mountPath: /root/.config/opencode-telegram-bot
              subPath: telegram-bot
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
            - name: instructions
              mountPath: /CLAUDE.md
              subPath: CLAUDE.md
          env:
            - name: OPENCODE_SERVER_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-opencode-auth" .Values.name }}
                  key: password
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: {{ .Values.telegram.token }}
            - name: TELEGRAM_ALLOWED_USER_ID
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: {{ .Values.telegram.allowedUser }}
            - name: OPENCODE_API_URL
              value: "http://localhost:4096"
            - name: OPENCODE_MODEL_PROVIDER
              value: {{ $agent.defaultModel.provider | quote }}
            - name: OPENCODE_MODEL_ID
              value: {{ $agent.defaultModel.id | quote }}
            - name: OPEN_BROWSER_ROOTS
              value: /projects,/code
            - name: STT_API_URL
              value: {{ $agent.speechToText.baseUrl | quote }}
            - name: STT_API_KEY
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: {{ $agent.speechToText.secretKey | quote }}
            - name: STT_MODEL
              value: {{ $agent.speechToText.model | quote }}

      volumes:
        - name: mcp-oauth-proxy
          configMap:
            name: {{ printf "%s-opencode-mcp-oauth" .Values.name }}
        - name: mcp-oauth-tmp
          emptyDir: {}
        - name: opencode-data
          hostPath:
            path: {{ .Values.opencode.dataPath }}
            type: DirectoryOrCreate
        - name: ssh-key
          secret:
            secretName: senaev-com-kv-secrets
            items:
              - key: {{ .Values.git.sshPrivateKey }}
                path: id_rsa
                mode: 0600
        - name: ssh-dir
          emptyDir: {}
        - name: projects
          persistentVolumeClaim:
            claimName: {{ printf "%s-projects" .Values.name }}
        - name: code
          persistentVolumeClaim:
            claimName: {{ printf "%s-code" .Values.name }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
---
# Only the existing HTTPS ingress controller can reach the web/API port.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%s-opencode-telegram" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%s-opencode-telegram" .Values.name }}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: traefik
          podSelector:
            matchLabels:
              app: traefik
              traefik-deployment: {{ .Values.traefik }}
      ports:
        - protocol: TCP
          port: 4096
        - protocol: TCP
          port: 8081
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%s-opencode" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%s-opencode-telegram" .Values.name }}
  ports:
    - name: http
      port: 4096
      targetPort: opencode
---
# Isolate a missing new Vault property from the existing shared application secret.
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ printf "%s-opencode-auth" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: vault-cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: {{ printf "%s-opencode-auth" .Values.name }}
    creationPolicy: Owner
  data:
    - secretKey: password
      remoteRef:
        key: senaev-com-kv
        property: {{ .Values.opencode.secrets.opencodePassword }}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%s-opencode-mcp-oauth" .Values.name }}
  namespace: {{ .Release.Namespace }}
data:
  nginx.conf: |
{{ include "senaev-com.opencodeMcpOAuthNginx" . | indent 4 }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%s-opencode-mcp-oauth" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%s-opencode-telegram" .Values.name }}
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
  name: {{ printf "%s-opencode-mcp-oauth" .Values.name }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
spec:
  ingressClassName: {{ printf "traefik-%s" .Values.traefik }}
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
                name: {{ printf "%s-opencode-mcp-oauth" .Values.name }}
                port:
                  number: 8081
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ printf "%s-opencode" .Values.name }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
spec:
  ingressClassName: {{ printf "traefik-%s" .Values.traefik }}
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
                name: {{ printf "%s-opencode" .Values.name }}
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
