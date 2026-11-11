{{/* Each component gets only its instance values: no credential/data fallback. */}}
{{- define "senaev-com.codingAgentComponent" -}}
{{- $seenPaths := dict -}}
{{- $seenHosts := dict -}}
{{- range $name, $instance := .root.Values.codingAgentInstances -}}
  {{- if or $instance.opencode.enabled $instance.ompWeb.enabled $instance.codeTools.enabled -}}
    {{- if not (regexMatch "^[a-z][a-z0-9-]{0,29}$" $name) -}}
      {{- fail (printf "codingAgentInstances.%s: the name is the resource prefix, so it must be lowercase DNS characters, start with a letter and have at most 30 characters" $name) -}}
    {{- end -}}
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
{{- $_ := set $values "resourcePrefix" (printf "%s-" .name) -}}
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
