# One-line installer for PowerSoftware Agent Skills (Windows / PowerShell).
#
# Usage:
#   iwr -useb https://raw.githubusercontent.com/powersoftware-app/powersoftware-agent-skills/main/install.ps1 | iex
#
# In mainland China (GitHub raw unreachable), install via the Gitee mirror instead:
#   iwr -useb https://gitee.com/powersoftware-app/powersoftware-agent-skills/raw/main/install.ps1 | iex
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
# 依次尝试的仓库镜像：GitHub 优先，中国大陆访问不通时自动回退 Gitee（两者内容一致）
$RepoUrls = @(
    "https://github.com/powersoftware-app/powersoftware-agent-skills.git",
    "https://gitee.com/powersoftware-app/powersoftware-agent-skills.git"
)

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
    # git 会把 "Cloning into ..." 等正常进度写到 stderr；在 PowerShell 里用 2>&1 管道合并 stderr
    # 会把每行包成 ErrorRecord，配合 $ErrorActionPreference=Stop 会误抛 NativeCommandError 中断脚本
    # （实际 clone 已成功）。故：跑 git 期间临时降为 Continue、加 --quiet，并用真实退出码 $LASTEXITCODE 判定成败。
    # 镜像回退：GitHub 不通则自动改试 Gitee；每次 clone 到独立子目录，避免上次失败的残留触发
    # "destination path already exists and is not an empty directory"。
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $Repo = $null
    foreach ($url in $RepoUrls) {
        Write-Host "-> cloning $url"
        $RepoDir = Join-Path $Tmp "repo"
        if (Test-Path $RepoDir) { Remove-Item -Recurse -Force $RepoDir }
        git clone --depth 1 --quiet $url $RepoDir 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $Repo = $RepoDir; break }
        Write-Host "   clone failed, trying next mirror..."
    }
    $ErrorActionPreference = $prevEap
    if (-not $Repo) {
        Write-Error "git clone failed from all mirrors (github + gitee)"
        exit 1
    }

    $Src = Join-Path $Repo "skills\$Skill"
    if (-not (Test-Path $Src)) {
        Write-Error "skill '$Skill' not found under skills/"
        Get-ChildItem (Join-Path $Repo "skills") | ForEach-Object { Write-Host "  - $($_.Name)" }
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
    if ($Skill -eq "integrate-license") {
        Write-Host "Next steps:"
        Write-Host "  cd `"$Dest\scripts`""
        Write-Host "  node fetch-sdk.mjs --lang node --dest <your-project>/vendor   # pull the latest SDK source"
        Write-Host "  node smoke.mjs --product <productUniqueCode>                  # verify platform connectivity"
    } else {
        Write-Host "Next steps:"
        Write-Host "  cd `"$Dest\scripts`""
        Write-Host "  copy config.example.json config.local.json   # fill in baseUrl/email/password"
        Write-Host "  node register.mjs --send-code                # then follow the README quickstart"
    }
}
finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
