$ErrorActionPreference = 'Stop'
try {
    $data = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($data.hook_event_name -ne 'Stop' -or $data.session_id -notmatch '^[a-fA-F0-9-]{36}$' -or $data.turn_id -notmatch '^[a-zA-Z0-9._-]{1,128}$') { throw 'invalid event' }
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { $bytes = $hash.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($env:USERPROFILE.ToLowerInvariant())); $hex = ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant().Substring(0,20) } finally { $hash.Dispose() }
    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', 'maxagent-codex-stop-'+$hex, [System.IO.Pipes.PipeDirection]::Out)
    try { $pipe.Connect(200); $writer = [System.IO.StreamWriter]::new($pipe, [System.Text.UTF8Encoding]::new($false)); $writer.WriteLine((@{session=$data.session_id;turn=$data.turn_id} | ConvertTo-Json -Compress)); $writer.Flush() } finally { $pipe.Dispose() }
} catch { }
[Console]::Out.WriteLine('{}')
