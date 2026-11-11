{{/* Each component gets only its workspace values: no credential/data fallback. */}}
{{- define "senaev-com.llmWorkspace.component" -}}
{{- $seenPaths := dict -}}
{{- $seenHosts := dict -}}
{{- range $name, $workspace := .root.Values.llmWorkspaces -}}
  {{- if or $workspace.opencode.enabled $workspace.ompWeb.enabled $workspace.codeTools.enabled -}}
    {{- if not (regexMatch "^[a-z][a-z0-9-]{0,29}$" $name) -}}
      {{- fail (printf "llmWorkspaces.%s: the name is the resource prefix, so it must be lowercase DNS characters, start with a letter and have at most 30 characters" $name) -}}
    {{- end -}}
    {{- if not $workspace.opencode.enabled -}}{{ fail "OMP and Code Tools require their workspace's OpenCode" }}{{- end -}}
    {{- $path := required "Each workspace requires opencode.dataPath" $workspace.opencode.dataPath -}}
    {{- if not (hasPrefix "/" $path) -}}{{ fail "opencode.dataPath must be absolute" }}{{- end -}}
    {{- $path = clean $path -}}
    {{- if eq $path "/" -}}{{ fail "opencode.dataPath must not be the filesystem root" }}{{- end -}}
    {{- range $otherPath, $_ := $seenPaths -}}
      {{- if or (eq $path $otherPath) (hasPrefix (printf "%s/" $otherPath) $path) (hasPrefix (printf "%s/" $path) $otherPath) -}}
        {{- fail "llmWorkspaces must have separate, non-overlapping opencode.dataPath directories" -}}
      {{- end -}}
    {{- end -}}
    {{- $_ := set $seenPaths $path true -}}
    {{- $hosts := list (required "Each workspace requires opencode.hostname" $workspace.opencode.hostname) -}}
    {{- if $workspace.ompWeb.enabled -}}{{ $hosts = append $hosts (required "OMP requires ompWeb.hostname" $workspace.ompWeb.hostname) }}{{- end -}}
    {{- $callbackHost := $workspace.opencode.mcpOAuth.hostname -}}
    {{- if ne $callbackHost $workspace.opencode.hostname -}}{{ $hosts = append $hosts $callbackHost }}{{- end -}}
    {{- range $host := $hosts -}}
      {{- if hasKey $seenHosts $host -}}{{ fail "llmWorkspaces must have distinct web hostnames" }}{{- end -}}
      {{- $_ := set $seenHosts $host true -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- $values := deepCopy .workspace -}}
{{- $_ := set $values "name" .name -}}
{{- $context := dict "Values" $values "Release" .root.Release "Files" .root.Files -}}
{{- include (printf "senaev-com.llmWorkspace.%s" .component) $context -}}
{{- end -}}
