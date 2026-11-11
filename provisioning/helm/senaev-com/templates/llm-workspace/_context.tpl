{{/* Each component gets only its workspace values: no credential/data fallback. */}}
{{- define "senaev-com.llmWorkspace.component" -}}
{{- $values := deepCopy .workspace -}}
{{- $_ := set $values "name" .name -}}
{{- range $component := list "opencode" "ompWeb" "codeTools" -}}
  {{- if not (hasKey $values $component) -}}{{ $_ := set $values $component (dict "enabled" false) }}{{- end -}}
{{- end -}}
{{- $context := dict "Values" $values "Release" .root.Release "Files" .root.Files -}}
{{- include (printf "senaev-com.llmWorkspace.%s" .component) $context -}}
{{- end -}}
