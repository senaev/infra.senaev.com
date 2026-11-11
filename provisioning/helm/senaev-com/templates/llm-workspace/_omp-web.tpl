{{- define "senaev-com.llmWorkspace.ompWebSecretKeys" -}}
{{- $agent := .Values.agent }}
{{- $keys := list $agent.speechToText.secretKey }}
{{- range $connector := $agent.connectors }}
{{- $keys = append $keys $connector.secretKey }}
{{- end }}
{{- if .Values.git }}
{{- $keys = append $keys .Values.git.githubToken }}
{{- $keys = append $keys .Values.git.sshPrivateKey }}
{{- end }}
{{- $keys | uniq | sortAlpha | toJson }}
{{- end -}}

{{- define "senaev-com.llmWorkspace.ompWeb" -}}
{{- $agent := .Values.agent }}
{{- if .Values.ompWeb.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ printf "%s-omp-web" .Values.name }}
  namespace: {{ .Release.Namespace }}
data:
  nginx.conf: |
{{ .Files.Get "config/omp-web/nginx.conf" | indent 4 }}
  models.yml: |
    providers:
{{- range $name, $connector := $agent.connectors }}
      {{ $name | quote }}:
        baseUrl: {{ $connector.baseUrl | quote }}
        apiKey: {{ $connector.secretKey | quote }}
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
  name: {{ printf "%s-omp-web-basicauth" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: vault-cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: {{ printf "%s-omp-web-basicauth" .Values.name }}
    creationPolicy: Owner
  data:
    - secretKey: users
      remoteRef:
        key: senaev-com-kv
        property: {{ .Values.ompWeb.secrets.ompHtpasswd }}
---
# Only the keys that OMP reads: a node can read every secret its pods use, whole.
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: {{ printf "%s-omp-web-env" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 30s
  secretStoreRef:
    name: vault-cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: {{ printf "%s-omp-web-env" .Values.name }}
    creationPolicy: Owner
  data:
{{- range $key := include "senaev-com.llmWorkspace.ompWebSecretKeys" . | fromJsonArray }}
    - secretKey: {{ $key }}
      remoteRef:
        key: senaev-com-kv
        property: {{ $key }}
{{- end }}
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: {{ printf "%s-omp-web-basicauth" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  basicAuth:
    secret: {{ printf "%s-omp-web-basicauth" .Values.name }}
    removeHeader: true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ printf "%s-omp-web" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: {{ printf "%s-omp-web" .Values.name }}
  template:
    metadata:
      labels:
        app: {{ printf "%s-omp-web" .Values.name }}
        vps: {{ .Values.vps }}
        admission.datadoghq.com/enabled: "true"
        tags.datadoghq.com/service: omp-web
        tags.datadoghq.com/env: prod
        tags.datadoghq.com/version: latest
      annotations:
        secret.reloader.stakater.com/reload: {{ printf "%s-omp-web-env" .Values.name | quote }}
        configmap.reloader.stakater.com/reload: {{ printf "%s-instructions,%s-omp-web" .Values.name .Values.name | quote }}
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      nodeSelector:
        vps: {{ .Values.vps }}
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
                  name: {{ printf "%s-omp-web-env" $.Values.name }}
                  key: {{ $agent.speechToText.secretKey | quote }}
            - name: OMP_DEFAULT_MODEL
              value: {{ printf "%s/%s" $agent.defaultModel.provider $agent.defaultModel.id | quote }}
{{- if .Values.git }}
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
                  name: {{ printf "%s-omp-web-env" $.Values.name }}
                  key: {{ .Values.git.githubToken }}
{{- end }}
{{- range $connector := $agent.connectors }}
            - name: {{ $connector.secretKey | quote }}
              valueFrom:
                secretKeyRef:
                  name: {{ printf "%s-omp-web-env" $.Values.name }}
                  key: {{ $connector.secretKey | quote }}
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
            - name: projects
              mountPath: /projects
            - name: state
              mountPath: /root/.omp
{{- if .Values.git }}
            - name: ssh
              mountPath: /root/.ssh
              readOnly: true
{{- end }}
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
        - name: projects
          persistentVolumeClaim:
            claimName: {{ printf "%s-projects" .Values.name }}
        - name: state
          persistentVolumeClaim:
            claimName: {{ printf "%s-omp-web-state" .Values.name }}
{{- if .Values.git }}
        - name: ssh
          secret:
            secretName: {{ printf "%s-omp-web-env" .Values.name }}
            defaultMode: 0600
            items:
              - key: {{ .Values.git.sshPrivateKey }}
                path: id_rsa
{{- end }}
        - name: defaults
          configMap:
            name: {{ printf "%s-omp-web" .Values.name }}
        - name: instructions
          configMap:
            name: {{ printf "%s-instructions" .Values.name }}
        - name: proxy-tmp
          emptyDir: {}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ printf "%s-omp-web-state" .Values.name }}
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
  name: {{ printf "%s-omp-web" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: {{ printf "%s-omp-web" .Values.name }}
  ports:
    - name: http
      port: 8080
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ printf "%s-omp-web" .Values.name }}
  namespace: {{ .Release.Namespace }}
spec:
  podSelector:
    matchLabels:
      app: {{ printf "%s-omp-web" .Values.name }}
  policyTypes: [Ingress, Egress]
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
  # The agent runs any command without approval, so it gets DNS and the public
  # internet only: no pods, Services, nodes, tailnet or private networks.
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8
              - 100.64.0.0/10
              - 169.254.0.0/16
              - 172.16.0.0/12
              - 192.168.0.0/16
        - ipBlock:
            cidr: ::/0
            except:
              - fc00::/7
              - fe80::/10
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ printf "%s-omp-web" .Values.name }}
  namespace: {{ .Release.Namespace }}
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls: "true"
    traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
    traefik.ingress.kubernetes.io/router.middlewares: {{ .Release.Namespace }}-{{ .Values.name }}-omp-web-basicauth@kubernetescrd
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
                name: {{ printf "%s-omp-web" .Values.name }}
                port:
                  number: 8080
{{- end }}
{{- end -}}
