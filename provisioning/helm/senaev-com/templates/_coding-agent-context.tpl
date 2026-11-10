{{/* Each component gets only its instance values: no credential/data fallback. */}}
{{- define "senaev-com.codingAgentComponent" -}}
{{- $seenPrefixes := dict -}}
{{- $seenPaths := dict -}}
{{- $seenHosts := dict -}}
{{- $seenIngresses := dict -}}
{{- range $name, $instance := .root.Values.codingAgentInstances -}}
  {{- if or $instance.opencode.enabled $instance.ompWeb.enabled $instance.codeTools.enabled -}}
    {{- $prefix := $instance.resourcePrefix -}}
    {{- if not (or (eq $prefix "") (regexMatch "^[a-z][a-z0-9-]{0,29}-$" $prefix)) -}}
      {{- fail (printf "codingAgentInstances.%s.resourcePrefix must be empty or a DNS prefix ending in '-' (max 31 characters)" $name) -}}
    {{- end -}}
    {{- if hasKey $seenPrefixes $prefix -}}{{ fail "codingAgentInstances must have distinct resourcePrefix values" }}{{- end -}}
    {{- $_ := set $seenPrefixes $prefix true -}}
    {{- if not $instance.opencode.enabled -}}{{ fail "OMP and Code Tools require their instance's OpenCode" }}{{- end -}}
    {{- $path := required "Each instance requires opencode.dataPath" $instance.opencode.dataPath -}}
    {{- if not (hasPrefix "/" $path) -}}{{ fail "opencode.dataPath must be absolute" }}{{- end -}}
    {{- $path = clean $path -}}
    {{- if eq $path "/" -}}{{ fail "opencode.dataPath must not be the filesystem root" }}{{- end -}}
    {{- range $otherPath, $_ := $seenPaths -}}
      {{- if or (eq $path $otherPath) (hasPrefix (printf "%s/" $otherPath) $path) (hasPrefix (printf "%s/" $path) $otherPath) -}}
        {{- fail "codingAgentInstances must have separate, non-overlapping opencode.dataPath directories" -}}
      {{- end -}}
    {{- end -}}
    {{- $_ := set $seenPaths $path true -}}
    {{- $ingress := required "Each instance requires opencode.ingressName" $instance.opencode.ingressName -}}
    {{- if hasKey $seenIngresses $ingress -}}{{ fail "codingAgentInstances must have distinct opencode.ingressName values" }}{{- end -}}
    {{- $_ := set $seenIngresses $ingress true -}}
    {{- $hosts := list (required "Each instance requires opencode.hostname" $instance.opencode.hostname) -}}
    {{- if $instance.ompWeb.enabled -}}{{ $hosts = append $hosts (required "OMP requires ompWeb.hostname" $instance.ompWeb.hostname) }}{{- end -}}
    {{- $callbackHost := $instance.opencode.mcpOAuth.hostname -}}
    {{- if ne $callbackHost $instance.opencode.hostname -}}{{ $hosts = append $hosts $callbackHost }}{{- end -}}
    {{- range $host := $hosts -}}
      {{- if hasKey $seenHosts $host -}}{{ fail "codingAgentInstances must have distinct web hostnames" }}{{- end -}}
      {{- $_ := set $seenHosts $host true -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- $values := deepCopy .instance -}}
{{- $agent := $values.agent -}}
{{- $agentContent := $agent | toJson -}}
{{- if not $agent -}}
  {{- $configPath := required "Each instance requires agent or agentConfigFile" $values.agentConfigFile -}}
  {{- $agentContent = required (printf "Missing agent config: %s" $configPath) (.root.Files.Get $configPath) -}}
  {{- $agent = $agentContent | mustFromJson -}}
{{- end -}}
{{- $_ := set $values "agent" $agent -}}
{{- $_ := set $values "agentConfigContent" $agentContent -}}
{{- $context := dict "Values" $values "Release" .root.Release "Files" .root.Files -}}
{{- include (printf "senaev-com.codingAgent.%s" .component) $context -}}
{{- end -}}
