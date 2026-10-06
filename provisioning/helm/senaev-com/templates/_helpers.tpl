{{- define "senaev-com.xrayVpnConfig" -}}
{{- $instance := .instance -}}
{{- $root := .root -}}
{{- $publicInboundEnabled := not (empty $instance.realityServerName) -}}
{{- $inbounds := list -}}
{{- $rules := list -}}
{{- $clients := list -}}
{{- if $publicInboundEnabled }}
  {{- range $profile := $instance.profiles }}
    {{- $clients = append $clients (dict
      "email" $profile.user
      "id" $profile.uuidMacro
      "flow" "xtls-rprx-vision"
    ) -}}
    {{- $rules = append $rules (dict
      "type" "field"
      "inboundTag" (list (printf "inbound-%s" $instance.name))
      "user" (list $profile.user)
      "outboundTag" $profile.outbound
    ) -}}
  {{- end -}}
{{- end -}}
{{- if $publicInboundEnabled }}
  {{- $streamSettings := dict
    "network" "tcp"
    "security" "reality"
    "realitySettings" (dict
      "dest" (printf "traefik-%s.traefik.svc.cluster.local:8443" $instance.vps)
      "serverNames" (list $instance.realityServerName)
      "privateKey" "{XRAY_REALITY_PRIVATE_KEY}"
      "shortIds" (list "")
    )
  -}}
  {{- $inbounds = append $inbounds (dict
    "tag" (printf "inbound-%s" $instance.name)
    "port" 443
    "protocol" "vless"
    "settings" (dict
      "clients" $clients
      "decryption" "none"
    )
    "streamSettings" $streamSettings
  ) -}}
{{- end -}}
{{- $inbounds = append $inbounds (dict
  "tag" "inbound-socks"
  "port" 1080
  "protocol" "socks"
  "settings" (dict
    "auth" "noauth"
    "udp" true
  )
) -}}
{{- $outbounds := list -}}
{{- range $xrayInstance := $root.Values.xrayVpn.instances }}
  {{- $outbounds = append $outbounds (dict
    "tag" (printf "outbound-%s" $xrayInstance.vps)
    "protocol" "socks"
    "settings" (dict
      "servers" (list (dict
        "address" $xrayInstance.name
        "port" 1080
      ))
    )
  ) -}}
{{- end -}}
{{- /*
  UseIPv4v6: IPv4 whenever the domain has an A record, IPv6 only for IPv6-only domains.
  The cluster is dual-stack; on a node without public IPv6 an IPv6 connection fails at once
  ("network is unreachable"), so no IPv6 blackhole is needed.
  See issues/2026-10-04-k3s-dual-stack-ipv6.md
*/ -}}
{{- $outbounds = append $outbounds (dict
  "tag" "outbound-freedom"
  "protocol" "freedom"
  "streamSettings" (dict "sockopt" (dict "domainStrategy" "UseIPv4v6"))
) -}}
{{- $rules = append $rules (dict
  "type" "field"
  "inboundTag" (list "inbound-socks")
  "outboundTag" "outbound-freedom"
) -}}
{{- $config := dict
  "log" (dict
    "access" "/dev/stdout"
    "error" "/dev/stderr"
    "loglevel" "debug"
  )
  "inbounds" $inbounds
  "outbounds" $outbounds
  "routing" (dict "rules" $rules)
-}}
{{- $config | toPrettyJson -}}
{{- end -}}
