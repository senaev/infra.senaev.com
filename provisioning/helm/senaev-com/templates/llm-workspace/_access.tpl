{{/* Shared pod security, API access and egress baseline for every coding component.
Keep caller-specific ingress in each component. NetworkPolicy allows replies to
accepted incoming connections; no reverse egress exception is needed.
*/}}
{{- define "senaev-com.llmWorkspace.podAccess" -}}
automountServiceAccountToken: false
securityContext:
  seccompProfile:
    type: RuntimeDefault
{{- end -}}

{{- define "senaev-com.llmWorkspace.egress" -}}
  # DNS, workspace HTTPS ingress and public destinations. NetworkPolicy node/NAT
  # limitations still apply; this is not complete host isolation.
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
    # Public node :443 can be DNATed to the ingress pod before policy checks.
    # Match only this workspace's ingress controller, never all private IPs.
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: traefik
          podSelector:
            matchLabels:
              app: traefik
              traefik-deployment: {{ .Values.traefik }}
      ports:
        - protocol: TCP
          port: 443
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
{{- end -}}
