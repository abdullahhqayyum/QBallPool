$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$client = Join-Path $root 'client'
$server = Join-Path $root 'server'

# Start client dev in a new PowerShell window
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-NoProfile","-Command","Set-Location -Path `"$client`"; npm run dev" -WorkingDirectory $client

# Start server dev in a new PowerShell window
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-NoProfile","-Command","Set-Location -Path `"$server`"; npm run dev" -WorkingDirectory $server
