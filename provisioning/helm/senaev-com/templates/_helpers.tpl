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
  {{- $inbounds = append $inbounds (dict
    "tag" (printf "inbound-%s" $instance.name)
    "port" 443
    "protocol" "vless"
    "settings" (dict
      "clients" $clients
      "decryption" "none"
    )
    "streamSettings" (dict
      "network" "tcp"
      "security" "reality"
      "realitySettings" (dict
        "dest" (printf "traefik-%s.traefik.svc.cluster.local:8443" $instance.vps)
        "serverNames" (list $instance.realityServerName)
        "privateKey" "{XRAY_REALITY_PRIVATE_KEY}"
        "shortIds" (list "")
      )
    )
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
{{- $outbounds = append $outbounds (dict
  "tag" "outbound-freedom"
  "protocol" "freedom"
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
