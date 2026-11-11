{{- define "senaev-com.codingAgent.ompWeb" -}}
{{- $agent := .Values.agent }}
{{- if .Values.ompWeb.enabled }}
{{- if not .Values.opencode.enabled }}
{{- fail "ompWeb requires opencode for the shared repository PVC and server instructions" }}
{{- end }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%somp-web" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
data:
  nginx.conf: |
{{ .Files.Get "config/omp-web/nginx.conf" | indent 4 }}
  config.yml: |
    modelRoles:
      default: {{ printf "%s/%s" $agent.defaultModel.provider $agent.defaultModel.id | quote }}
    tools:
      approvalMode: yolo
  models.yml: |
    providers:
{{- range $name, $connector := $agent.connectors }}
      {{ $name | quote }}:
        baseUrl: {{ $connector.baseUrl | quote }}
        apiKey: {{ $connector.apiKeyEnv | quote }}
{{- end }}
  mcp.json: |
{{- $servers := dict }}
{{- range $name, $server := $agent.mcp }}
{{- $_ := set $servers $name (merge (dict "type" "http") $server) }}
{{- end }}
{{ dict "mcpServers" $servers | toPrettyJson | indent 4 }}
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ printf "%somp-web-basicauth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: {{ .Values.secrets.storeName }}
    kind: {{ .Values.secrets.storeKind }}
  target:
    name: {{ printf "%somp-web-basicauth" .Values.resourcePrefix }}
    creationPolicy: Owner
  data:
    - secretKey: users
      remoteRef:
        key: {{ .Values.secrets.vaultPath }}
        property: {{ .Values.secrets.ompHtpasswd }}
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: {{ printf "%somp-web-basicauth" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  basicAuth:
    secret: {{ printf "%somp-web-basicauth" .Values.resourcePrefix }}
    removeHeader: true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%somp-web" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%somp-web" .Values.resourcePrefix }}
  template:
    metadata:
      labels:
        app: {{ printf "%somp-web" .Values.resourcePrefix }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: omp-web
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        checksum/config: {{ printf "%s\n%s" (.Files.Get "config/omp-web/nginx.conf") (.Values.agentConfigContent) | sha256sum }}
        secret.reloader.stakater.com/reload: {{ .Values.secrets.name | quote }}
        configmap.reloader.stakater.com/reload: {{ list (printf "%somp-web" .Values.resourcePrefix) (printf "%sopencode-telegram-config" .Values.resourcePrefix) | join "," | quote }}
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      nodeSelector:
        vps: {{ .Values.opencode.vps }}
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: {{ printf "%sopencode-telegram" .Values.resourcePrefix }}
              topologyKey: kubernetes.io/hostname
      containers:
        - name: omp-web
          image: ghcr.io/senaev/omp-web:latest
          imagePullPolicy: Always
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              memory: 512Mi
            limits:
              memory: 2Gi
          env:
            - name: OMP_WEB_STT_ENDPOINT
              value: {{ printf "%s/audio/transcriptions" (trimSuffix "/" $agent.speechToText.baseUrl) | quote }}
            - name: OMP_WEB_STT_MODEL
              value: {{ $agent.speechToText.model | quote }}
            - name: OMP_WEB_STT_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ default $agent.speechToText.apiKeyEnv $agent.speechToText.secretKey | quote }}
            - name: OMP_DEFAULT_MODEL
              value: {{ printf "%s/%s" $agent.defaultModel.provider $agent.defaultModel.id | quote }}
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
{{- range $connector := $agent.connectors }}
            - name: {{ $connector.apiKeyEnv | quote }}
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.secrets.name }}
                  key: {{ default $connector.apiKeyEnv $connector.secretKey | quote }}
{{- end }}
          startupProbe:
            exec:
              command: ["curl", "--fail", "--silent", "--output", "/dev/null", "--max-time", "3", "http://127.0.0.1:30177/api/sessions"]
            periodSeconds: 5
            failureThreshold: 60
            timeoutSeconds: 5
          readinessProbe:
            exec:
              command: ["curl", "--fail", "--silent", "--output", "/dev/null", "--max-time", "3", "http://127.0.0.1:30177/api/sessions"]
            periodSeconds: 10
            timeoutSeconds: 5
          livenessProbe:
            exec:
              command: ["curl", "--fail", "--silent", "--output", "/dev/null", "--max-time", "3", "http://127.0.0.1:30177/api/sessions"]
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 6
          volumeMounts:
            - name: projects-git
              mountPath: /projects/git
            - name: state
              mountPath: /root/.omp
            - name: ssh
              mountPath: /root/.ssh
              readOnly: true
            - name: defaults
              mountPath: /defaults
              readOnly: true
            - name: instructions
              mountPath: /AGENTS.md
              subPath: AGENTS.md
              readOnly: true
        # OMP Web stays on loopback with no app password. Only Traefik may
        # reach this same-pod proxy; Traefik owns HTTPS and Basic Auth.
        - name: proxy
          image: nginxinc/nginx-unprivileged:1.28.0-alpine
          command: ["nginx", "-g", "daemon off;"]
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
          ports:
            - name: http
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /api/sessions
              port: http
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: defaults
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
              readOnly: true
            - name: proxy-tmp
              mountPath: /tmp
      volumes:
        - name: projects-git
          persistentVolumeClaim:
            claimName: {{ printf "%sopencode-telegram-git" .Values.resourcePrefix }}
        - name: state
          persistentVolumeClaim:
            claimName: {{ printf "%somp-web-state" .Values.resourcePrefix }}
        - name: ssh
          secret:
            secretName: {{ $.Values.secrets.name }}
            defaultMode: 0600
            items:
              - key: {{ .Values.secrets.sshPrivateKey }}
                path: id_rsa
        - name: defaults
          configMap:
            name: {{ printf "%somp-web" .Values.resourcePrefix }}
        - name: instructions
          configMap:
            name: {{ printf "%sopencode-telegram-config" .Values.resourcePrefix }}
        - name: proxy-tmp
          emptyDir: {}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ printf "%somp-web-state" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
  annotations:
    helm.sh/resource-policy: keep
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: {{ .Values.ompWeb.storageSize }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ printf "%somp-web" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%somp-web" .Values.resourcePrefix }}
  ports:
    - name: http
      port: 8080
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%somp-web" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%somp-web" .Values.resourcePrefix }}
  policyTypes: [Ingress]
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
          port: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ printf "%somp-web" .Values.resourcePrefix }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
    traefik.ingress.kubernetes.io/router.middlewares: {{ .Release.Namespace }}-{{ .Values.resourcePrefix }}omp-web-basicauth@kubernetescrd
spec:
  ingressClassName: {{ printf "traefik-%s" .Values.traefik }}
  tls:
    - hosts: [{{ .Values.ompWeb.hostname | quote }}]
  rules:
    - host: {{ .Values.ompWeb.hostname | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ printf "%somp-web" .Values.resourcePrefix }}
                port:
                  number: 8080
{{- end }}
{{- end -}}
