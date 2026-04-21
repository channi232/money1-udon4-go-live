Write-Host "Checking local prerequisites..." -ForegroundColor Cyan

$tools = @("node", "npm", "php", "mysql")
foreach ($tool in $tools) {
  $cmd = Get-Command $tool -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    Write-Host "[MISSING] $tool" -ForegroundColor Yellow
  } else {
    Write-Host "[OK] $tool -> $($cmd.Source)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Tip: Install Node.js LTS first for modern frontend scaffold." -ForegroundColor Magenta
