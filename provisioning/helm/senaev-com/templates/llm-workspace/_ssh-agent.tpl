{{/* An ssh-agent beside an agent container. Only the ssh-agent container mounts the SSH key;
the agent container gets the agent socket. It can sign with the key but cannot read it: the
agent protocol has no export, and containers of a pod do not share processes (keep
shareProcessNamespace off). The socket folder is read-only in the agent container, so it
cannot replace the socket. Use all three parts in one pod.
*/}}

{{/* A native sidecar in initContainers: it has the key loaded before the agent container
starts, and restarts on its own. ssh-agent accepts only root or its own user, and all
workspace containers run as root.
*/}}
{{- define "senaev-com.llmWorkspace.sshAgent.container" -}}
- name: ssh-agent
  image: alpine/git:latest
  restartPolicy: Always
  command: ["/bin/sh", "-ec"]
  args:
    - |
      export SSH_AUTH_SOCK=/ssh-agent/agent.sock
      rm -f "$SSH_AUTH_SOCK"
      ssh-agent -D -a "$SSH_AUTH_SOCK" &
      agent=$!
      trap 'kill "$agent"' TERM INT
      until [ -S "$SSH_AUTH_SOCK" ]; do sleep 1; done
      ssh-add /ssh-key/id_rsa
      wait "$agent"
  startupProbe:
    exec:
      command: ["/bin/sh", "-c", "SSH_AUTH_SOCK=/ssh-agent/agent.sock ssh-add -l"]
    periodSeconds: 2
    failureThreshold: 30
  securityContext:
{{ include "senaev-com.llmWorkspace.containerAccess" . | indent 4 }}
  resources:
    requests:
      memory: 16Mi
  volumeMounts:
    - name: ssh-key
      mountPath: /ssh-key
      readOnly: true
    - name: ssh-agent
      mountPath: /ssh-agent
{{- end -}}

{{/* In the agent container: env and volumeMounts. */}}
{{- define "senaev-com.llmWorkspace.sshAgent.env" -}}
- name: SSH_AUTH_SOCK
  value: /ssh-agent/agent.sock
{{- end -}}

{{- define "senaev-com.llmWorkspace.sshAgent.volumeMount" -}}
- name: ssh-agent
  mountPath: /ssh-agent
  readOnly: true
{{- end -}}

{{/* Pod volumes. .secretName is the component Secret that holds .Values.git.sshPrivateKey. */}}
{{- define "senaev-com.llmWorkspace.sshAgent.volumes" -}}
- name: ssh-key
  secret:
    secretName: {{ .secretName }}
    defaultMode: 0600
    items:
      - key: {{ .context.Values.git.sshPrivateKey }}
        path: id_rsa
- name: ssh-agent
  emptyDir:
    medium: Memory
    sizeLimit: 1Mi
{{- end -}}
