{{- define "vpn.xrayVpnConfig" -}}
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
{{- if ne $instance.exitEnabled false }}
{{- $inbounds = append $inbounds (dict
  "tag" "inbound-socks"
  "port" 1080
  "protocol" "socks"
  "settings" (dict
    "auth" "noauth"
    "udp" true
  )
) -}}
{{- end }}
{{- $outbounds := list -}}
{{- range $xrayInstance := $root.Values.xrayVpn.instances }}
  {{- if ne $xrayInstance.exitEnabled false }}
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
  {{- end }}
{{- end -}}
{{- /*
  UseIPv4v6: IPv4 whenever the domain has an A record, IPv6 only for IPv6-only domains.
  The cluster is dual-stack; on a node without public IPv6 an IPv6 connection fails at once
  ("network is unreachable"), so no IPv6 blackhole is needed.
  See projects/2026-10-04-k3s-dual-stack-ipv6/README.md
*/ -}}
{{- if ne $instance.exitEnabled false }}
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
{{- end }}
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



{{- /*
  Renders /template/full-config.json into /out/config.json: {XRAY_USER_UUID:<seed>} becomes the
  derived UUID (the same derivation as vpn-subscription and vpn-probe), other macros their env value.
*/ -}}
{{- define "vpn.renderXrayConfigScript" -}}
cat <<'EOF' >/tmp/render-config.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const macroValues = {
  XRAY_REALITY_PRIVATE_KEY: process.env.XRAY_REALITY_PRIVATE_KEY,
  XRAY_USER_UUID: process.env.XRAY_USER_UUID,
};

function deriveUuid(baseValue, seed) {
  const derivedSeed = createHash("sha256")
    .update(`${baseValue}:${seed}`)
    .digest("hex")
    .substring(0, 32);

  return `${derivedSeed.substr(0, 8)}-${derivedSeed.substr(8, 4)}-${derivedSeed.substr(12, 4)}-${derivedSeed.substr(16, 4)}-${derivedSeed.substr(20)}`;
}

const template = readFileSync("/template/full-config.json", "utf8");

const rendered = template.replace(/\{([A-Z0-9_]+)(?::([^}]*))?\}/g, (match, macroName, seed) => {
  if (macroName === "XRAY_USER_UUID" && seed !== undefined) {
    return deriveUuid(macroValues.XRAY_USER_UUID, seed);
  }

  const replacement = macroValues[macroName];
  if (replacement === undefined) {
    throw new Error(`Unsupported macro: ${match}`);
  }

  return replacement;
});

writeFileSync("/out/config.json", rendered);
EOF
node /tmp/render-config.mjs
{{- end -}}

{{- /*
  Hysteria2 (QUIC over UDP) server with a direct exit at its node. It reuses the Let's Encrypt
  certificate that Traefik keeps for serverName; clients verify it as usual. Unauthenticated
  QUIC requests get senaev.com through the masquerade proxy, like a normal HTTP/3 site.
*/ -}}
{{- define "vpn.xrayHysteriaConfig" -}}
{{- $hysteria := .Values.xrayHysteria -}}
{{- $clients := list -}}
{{- range $profile := $hysteria.profiles }}
  {{- $clients = append $clients (dict "auth" $profile.authMacro "email" $profile.user) -}}
{{- end -}}
{{- $config := dict
  "log" (dict "access" "none" "error" "/dev/stderr" "loglevel" (default "warning" $hysteria.logLevel))
  "inbounds" (list (dict
    "tag" "inbound-hysteria"
    "port" (int $hysteria.port)
    "protocol" "hysteria"
    "settings" (dict "version" 2 "clients" $clients)
    "streamSettings" (dict
      "network" "hysteria"
      "hysteriaSettings" (dict
        "version" 2
        "masquerade" (dict "type" "proxy" "url" (printf "https://%s/" $hysteria.serverName))
      )
      "finalmask" (dict "udp" (list (dict
        "type" "salamander"
        "settings" (dict "password" $hysteria.obfsPasswordMacro)
      )))
      "security" "tls"
      "tlsSettings" (dict
        "serverName" $hysteria.serverName
        "alpn" (list "h3")
        "certificates" (list (dict
          "certificateFile" "/tls/tls.crt"
          "keyFile" "/tls/tls.key"
        ))
      )
    )
  ))
  "outbounds" (list (dict
    "tag" "outbound-freedom"
    "protocol" "freedom"
    "streamSettings" (dict "sockopt" (dict "domainStrategy" "UseIPv4v6"))
  ))
-}}
{{- $config | toPrettyJson -}}
{{- end -}}

{{- /*
  Copies the certificate for serverName from Traefik's acme.json (read-only) into /tls.
  Writes only when the content changed, through a temporary file and rename.
*/ -}}
{{- define "vpn.acmeCertificateScript" -}}
cat <<'EOF' >/tmp/acme-certificate.mjs
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const name = process.env.SERVER_NAME;
const acme = JSON.parse(readFileSync("/acme/acme.json", "utf8"));
const certificates = Object.values(acme).flatMap((resolver) => resolver?.Certificates ?? []);
const match = certificates.find(({ domain }) =>
  domain?.main === name || (domain?.sans ?? []).includes(name));
if (!match) {
  throw new Error(`No certificate for ${name} in acme.json`);
}
for (const [file, value] of [["tls.crt", match.certificate], ["tls.key", match.key]]) {
  const content = Buffer.from(value, "base64").toString("utf8");
  const path = `/tls/${file}`;
  if (existsSync(path) && readFileSync(path, "utf8") === content) {
    continue;
  }
  writeFileSync(`${path}.tmp`, content, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  console.log(`Updated ${file} for ${name}`);
}
EOF
{{- end -}}
