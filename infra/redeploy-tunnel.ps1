# ClariVue — one-command tunnel recovery + Vercel redeploy (Windows / PowerShell).
#
# The live app reaches the self-hosted LiveKit SFU through a cloudflared *quick tunnel*
# (https://<name>.trycloudflare.com). Those tunnels are ephemeral and drop on machine
# sleep / network blips. When that happens, live video/recording-start break until the
# tunnel is restarted AND Vercel is repointed + redeployed (NEXT_PUBLIC_LIVEKIT_URL is
# inlined at build time, so a redeploy is required).
#
# This script does the whole recovery:
#   1. restart cloudflared  -> capture the fresh https URL
#   2. set Vercel prod env   LIVEKIT_URL (https) + NEXT_PUBLIC_LIVEKIT_URL (wss)
#   3. redeploy apps/web to the clari-vue project (staged plain-dir deploy)
#
# Prereqs (already true on the dev box): Docker media plane up
# (`docker compose -f infra/docker-compose.yml --profile recording up -d`), cloudflared
# installed, and `vercel` CLI logged in. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File infra\redeploy-tunnel.ps1

$ErrorActionPreference = "Stop"

$RepoRoot   = Split-Path -Parent $PSScriptRoot          # ...\ClariVue
$WebDir     = Join-Path $RepoRoot "apps\web"
$ProjectId  = "prj_zwlS8huG9bek5ZoSs1uFqOl6xI5W"
$OrgId      = "team_zc6RR2RwHn5KMd4IZYXq6cxG"
$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $Cloudflared)) { $Cloudflared = "cloudflared" }   # fall back to PATH
$LkLocal    = "http://localhost:7880"

Write-Host "==> ClariVue tunnel recovery" -ForegroundColor Cyan

# 0. sanity — local LiveKit must be reachable
try {
  Invoke-WebRequest -Uri $LkLocal -TimeoutSec 8 -UseBasicParsing | Out-Null
} catch {
  Write-Host "Local LiveKit ($LkLocal) is not responding. Start the media plane first:" -ForegroundColor Red
  Write-Host "  docker compose -f infra\docker-compose.yml --profile recording up -d"
  exit 1
}

# 1. restart cloudflared and capture the fresh URL
Write-Host "==> restarting cloudflared quick tunnel..." -ForegroundColor Cyan
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$log = Join-Path $env:TEMP ("clarivue-cf-{0}.log" -f (Get-Date -Format "yyyyMMddHHmmss"))
Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "--url", $LkLocal) `
  -RedirectStandardError $log -RedirectStandardOutput ($log + ".out") -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { Write-Host "Could not obtain a tunnel URL from cloudflared. Check $log" -ForegroundColor Red; exit 1 }
Write-Host "    tunnel URL: $url" -ForegroundColor Green

# verify the tunnel proxies LiveKit
try { Invoke-WebRequest -Uri $url -TimeoutSec 12 -UseBasicParsing | Out-Null }
catch { Write-Host "Tunnel did not proxy LiveKit (yet). Continuing anyway: $url" -ForegroundColor Yellow }

# 2. repoint Vercel production env
Write-Host "==> updating Vercel production env..." -ForegroundColor Cyan
Push-Location $WebDir
function Set-VercelEnv($name, $value) {
  cmd /c "vercel env rm $name production --yes" 2>$null | Out-Null
  $value | cmd /c "vercel env add $name production" 2>$null | Out-Null
  Write-Host "    $name set"
}
Set-VercelEnv "LIVEKIT_URL"            ("https://" + ($url -replace "^https://", ""))
Set-VercelEnv "NEXT_PUBLIC_LIVEKIT_URL" ("wss://"   + ($url -replace "^https://", ""))
Pop-Location

# 3. staged plain-dir deploy to the clari-vue project
Write-Host "==> redeploying apps/web to Vercel prod..." -ForegroundColor Cyan
$stage = Join-Path $env:TEMP "clarivue-deploy"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path (Join-Path $stage ".vercel") | Out-Null
'{"projectId":"' + $ProjectId + '","orgId":"' + $OrgId + '"}' | Set-Content -Encoding utf8 (Join-Path $stage ".vercel\project.json")
foreach ($item in @("app","components","lib","public","proxy.ts","next.config.ts","next-env.d.ts","tsconfig.json","package.json","postcss.config.mjs","eslint.config.mjs","vercel.json")) {
  $src = Join-Path $WebDir $item
  if (Test-Path $src) { Copy-Item -Recurse -Force $src (Join-Path $stage $item) }
}
Push-Location $stage
cmd /c "vercel --prod --yes"
Pop-Location

Write-Host ""
Write-Host "==> Done. Live at https://clari-vue.vercel.app (tunnel: $url)" -ForegroundColor Green
Write-Host "    Keep this machine + cloudflared + Docker media plane running for the demo." -ForegroundColor Yellow
