$nodePath = "C:\Program Files\nodejs"
if (-not (Test-Path $nodePath)) {
  Write-Host "Node.js path not found: $nodePath" -ForegroundColor Red
  exit 1
}

$env:Path = "$nodePath;$env:Path"
$webDir = "D:\FTP\การเงิน\money1.udon4.go.th\app\web"

Write-Host "Starting Next.js dev server at $webDir" -ForegroundColor Cyan
Set-Location $webDir
npm run dev
