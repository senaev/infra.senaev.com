#cloud-config
write_files:
  - path: /root/bootstrap-server.sh
    owner: root:root
    permissions: "0700"
    content: |
%{ for line in split("\n", bootstrap_server_script) ~}
      ${line}
%{ endfor ~}

runcmd:
  - ["/root/bootstrap-server.sh", "${tailscale_auth_key}", "${server_name}"]
