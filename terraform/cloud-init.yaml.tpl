#cloud-config
write_files:
  - path: /root/bootstrap-server.sh
    owner: root:root
    permissions: "0755"
    content: |
%{ for line in split("\n", bootstrap_server_script) ~}
      ${line}
%{ endfor ~}

runcmd:
  - /root/bootstrap-server.sh
