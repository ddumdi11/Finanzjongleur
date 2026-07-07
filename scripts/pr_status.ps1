param(
  [int]$Pr = 0,
  [string]$Repo = ""
)

function Fail([string]$msg) {
  Write-Host $msg -ForegroundColor Red
  exit 1
}

# --- Ensure we're inside a git repo and move to repo root ---
$top = git rev-parse --show-toplevel 2>$null
if (-not $top) { Fail "Not a git repository (run inside a repo folder)." }
Set-Location $top

# --- Basic local info ---
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "Repo:   $top" -ForegroundColor Cyan
Write-Host "Branch: $branch" -ForegroundColor Cyan

$porcelain = git status --porcelain
if ($porcelain) {
  Write-Host "WARN: Worktree is DIRTY (uncommitted changes)." -ForegroundColor Yellow
  Write-Host 'Tip:  git stash push -u -m "wip"' -ForegroundColor Yellow
  Write-Host ""
}

# --- Require GitHub CLI ---
gh --version *> $null
if ($LASTEXITCODE -ne 0) { Fail "GitHub CLI (gh) not found in PATH." }

# --- Detect Repo from origin if not provided ---
if (-not $Repo) {
  $origin = git remote get-url origin 2>$null
  if (-not $origin) { Fail "No 'origin' remote found. Provide -Repo owner/name." }

  # Supports:
  # https://github.com/OWNER/REPO(.git)
  # git@github.com:OWNER/REPO(.git)
  if ($origin -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)") {
    $Repo = "$($Matches.owner)/$($Matches.repo)"
  } else {
    Fail "Could not parse origin URL: $origin"
  }
}

# --- Detect PR number if not provided (robust: via head branch) ---
if ($Pr -eq 0) {
  $head = $branch
  $found = gh pr list --repo $Repo --head $head --state open --json number 2>$null | ConvertFrom-Json
  if ($found -and $found.Count -gt 0) {
    $Pr = [int]$found[0].number
  } else {
    # Fallback: try upstream branch name (origin/<name> -> <name>)
    $upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
    if ($upstream) {
      $head2 = ($upstream -replace '^origin/','')
      $found2 = gh pr list --repo $Repo --head $head2 --state open --json number 2>$null | ConvertFrom-Json
      if ($found2 -and $found2.Count -gt 0) {
        $Pr = [int]$found2[0].number
      }
    }
  }
}

if ($Pr -eq 0) {
  Write-Host "No open PR detected for this branch." -ForegroundColor Yellow
  Write-Host "Tip: Run with -Pr <number> or switch to a PR branch." -ForegroundColor Yellow
  exit 0
}

# --- Fetch PR JSON once and format locally (no jq needed) ---
$pr = gh pr view $Pr --repo $Repo `
  --json number,title,state,mergeable,reviewDecision,statusCheckRollup,reviewThreads `
  | ConvertFrom-Json

Write-Host ""
Write-Host "PR #$($pr.number): $($pr.title)" -ForegroundColor Green
Write-Host "State: $($pr.state) | Mergeable: $($pr.mergeable) | Review: $($pr.reviewDecision)"

$checksOk = $true
foreach ($c in $pr.statusCheckRollup) {
  if ($c.conclusion -ne "SUCCESS") { $checksOk = $false }
}
Write-Host "Checks OK: $checksOk"

Write-Host ""
Write-Host "Open review threads:" -ForegroundColor Yellow

$openThreads = $pr.reviewThreads | Where-Object { -not $_.isResolved }
if (-not $openThreads) {
  Write-Host "None"
} else {
  $openThreads | ForEach-Object {
    $c = $_.comments[0]
    $body = ($c.body -replace '\s+',' ').Trim()
    if ($body.Length -gt 160) { $body = $body.Substring(0,160) + "…" }

    Write-Host "- $($_.path):$($_.line) [$($c.author.login)]"
    Write-Host "  $body" -ForegroundColor DarkGray
  }
}
