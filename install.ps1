# One-line installer for PowerSoftware Agent Skills (Windows / PowerShell).
#
# Usage:
#   iwr -useb https://raw.githubusercontent.com/mizhanchengxi/powersoftware-agent-skills/main/install.ps1 | iex
#
# Or with explicit target/skill:
#   .\install.ps1 -Target "$HOME\.qoder-cn\skills" -Skill "publish-license-product"
#
# Recognised Target shortcuts:
#   qoder      -> $HOME\.qoder-cn\skills    (personal scope)
#   claude     -> $HOME\.claude\skills
#   <any path> -> used as-is

param(
    [string]$Target = "$HOME\.qoder-cn\skills",
    [string]$Skill  = "publish-license-product"
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/mizhanchengxi/powersoftware-agent-skills.git"

switch ($Target.ToLower()) {
    "qoder"  { $Target = Join-Path $HOME ".qoder-cn\skills" }
    "claude" { $Target = Join-Path $HOME ".claude\skills" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is required but not found in PATH"
    exit 1
}

$Tmp = Join-Path $env:TEMP ("ps-skills-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
    Write-Host "-> cloning $RepoUrl"
    git clone --depth 1 $RepoUrl $Tmp 2>&1 | Out-Null

    $Src = Join-Path $Tmp "skills\$Skill"
    if (-not (Test-Path $Src)) {
        Write-Error "skill '$Skill' not found under skills/"
        Get-ChildItem (Join-Path $Tmp "skills") | ForEach-Object { Write-Host "  - $($_.Name)" }
        exit 1
    }

    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    $Dest = Join-Path $Target $Skill

    if (Test-Path $Dest) {
        $Backup = "$Dest.bak.$([DateTimeOffset]::Now.ToUnixTimeSeconds())"
        Write-Host "-> existing install found, backing up to $Backup"
        Move-Item $Dest $Backup
    }

    Copy-Item -Recurse $Src $Dest
    Write-Host "OK installed '$Skill' -> $Dest"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  cd `"$Dest\scripts`""
    Write-Host "  copy config.example.json config.local.json   # fill in baseUrl/email/password"
    Write-Host "  node register.mjs --send-code                # then follow the README quickstart"
}
finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
