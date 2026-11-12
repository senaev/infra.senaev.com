{{/* Shared pod API access and egress baseline for every coding component.
Keep caller-specific ingress in each component. NetworkPolicy allows replies to
accepted incoming connections; no reverse egress exception is needed.
*/}}
{{- define "senaev-com.llmWorkspace.podAccess" -}}
automountServiceAccountToken: false
{{- end -}}

{{- define "senaev-com.llmWorkspace.egress" -}}
  # DNS and public destinations only. Standard NetworkPolicy node/NAT
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
