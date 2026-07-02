# Windows dev bootstrap — run from repo root in PowerShell
fnm use 20
Invoke-Expression (fnm env --use-on-cd | Out-String)
pnpm install
pnpm setup:env
Write-Host "`nReady. Run: pnpm dev" -ForegroundColor Green
