$ErrorActionPreference = 'Stop'
try {
    $data = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $type = if ($data.hook_event_name -eq 'Notification' -and $data.notification_type -eq 'idle_prompt') { 'idle_prompt' } else { $data.hook_event_name }
    if ($type -notin @('UserPromptSubmit','Stop','StopFailure','SessionEnd','idle_prompt') -or $data.agent_id -or $data.session_id -notmatch '^[a-fA-F0-9-]{36}$') { exit 0 }
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { $bytes = $hash.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($env:USERPROFILE.ToLowerInvariant())); $hex = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant().Substring(0,20) } finally { $hash.Dispose() }
    $packet = @{type=$type;session=$data.session_id}
    if ($type -eq 'Stop') { $packet.backgroundClear = ($null -ne $data.background_tasks -and @($data.background_tasks).Count -eq 0) }
    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', 'maxagent-claude-pet-'+$hex, [System.IO.Pipes.PipeDirection]::Out)
    try { $pipe.Connect(300); $writer = [System.IO.StreamWriter]::new($pipe, [System.Text.UTF8Encoding]::new($false)); $writer.WriteLine(($packet | ConvertTo-Json -Compress)); $writer.Flush() } finally { $pipe.Dispose() }
} catch { }
exit 0
