param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LauncherDir = Join-Path $ProjectRoot "local-samples\launcher"
$PortFile = Join-Path $LauncherDir "port.txt"
$PidFile = Join-Path $LauncherDir "server.pid"
$StdoutLog = Join-Path $LauncherDir "server.log"
$StderrLog = Join-Path $LauncherDir "server-error.log"
$LauncherErrorLog = Join-Path $LauncherDir "launcher-error.txt"

function Write-LauncherErrorLog {
  param([string]$Message)
  try {
    New-Item -ItemType Directory -Force -Path $LauncherDir | Out-Null
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $LauncherErrorLog -Value "[$timestamp] $Message"
  } catch {
    # The visible launcher still reports errors if logging is unavailable.
  }
}

trap {
  Write-LauncherErrorLog ($_ | Out-String)
  exit 1
}

function Show-LauncherError {
  param([string]$Message)
  $fullMessage = "$Message`n`n日志目录：$LauncherDir"
  Write-LauncherErrorLog $Message
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      $fullMessage,
      "知卷启动失败",
      "OK",
      "Error"
    ) | Out-Null
  } catch {
    Write-Host $fullMessage -ForegroundColor Red
  }
}

function Exit-WithError {
  param([string]$Message)
  Show-LauncherError $Message
  exit 1
}

function Get-NodeCommand {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Get-Sha256 {
  param([string]$Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace("-", "")
  } finally {
    if ($stream) {
      $stream.Dispose()
    }
    $sha.Dispose()
  }
}

function Get-PythonLaunch {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @{
      Command = $py.Source
      Prefix = @("-3")
      Label = "py -3"
    }
  }
  foreach ($candidate in @("python3", "python")) {
    $python = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($python) {
      return @{
        Command = $python.Source
        Prefix = @()
        Label = $candidate
      }
    }
  }
  return $null
}

function Test-AppEndpoint {
  param([int]$Port)
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$Port/api/status" `
      -TimeoutSec 1
    return $response.StatusCode -eq 200 -and $response.Content.Contains("keyConfigured")
  } catch {
    return $false
  }
}

function Test-PortAvailable {
  param([int]$Port)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Loopback,
      $Port
    )
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Open-App {
  param([int]$Port)
  Start-Process "http://127.0.0.1:$Port/"
}

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path $LauncherDir | Out-Null

$node = Get-NodeCommand
if (-not $node) {
  Exit-WithError "未找到 Node.js。请安装 Node.js 22 LTS（至少 20.19）后再次双击启动。下载地址：https://nodejs.org/"
}

$nodeVersion = (& $node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
$nodeMinor = [int]($nodeVersion.Split(".")[1])
$nodeTooOld = ($nodeMajor -lt 20) -or ($nodeMajor -eq 20 -and $nodeMinor -lt 19) -or ($nodeMajor -eq 21) -or ($nodeMajor -eq 22 -and $nodeMinor -lt 12)
if ($nodeTooOld) {
  Exit-WithError "Node.js 版本过低（当前 $nodeVersion）。请安装 Node.js 22 LTS 后重试：https://nodejs.org/"
}

$python = Get-PythonLaunch
if (-not $python) {
  Exit-WithError "未找到 Python。请安装 Python 3.11 或更高版本，并勾选 Add Python to PATH。下载地址：https://www.python.org/downloads/"
}
$pythonVersionArgs = @($python.Prefix) + @(
  "-c",
  "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
)
$pythonVersion = (& $python.Command @pythonVersionArgs).Trim()
$pythonParts = $pythonVersion.Split(".")
$pythonMajor = [int]$pythonParts[0]
$pythonMinor = [int]$pythonParts[1]
if ($pythonMajor -lt 3 -or ($pythonMajor -eq 3 -and $pythonMinor -lt 11)) {
  Exit-WithError "Python 版本过低（当前 $pythonVersion）。请安装 Python 3.11 或更高版本：https://www.python.org/downloads/"
}

if ($CheckOnly) {
  Write-Host "Node.js $nodeVersion"
  Write-Host "Python $pythonVersion ($($python.Label))"
  Write-Host "Project root: $ProjectRoot"
  exit 0
}

$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
  Write-Host "正在创建 Python 环境..."
  $venvArgs = @($python.Prefix) + @("-m", "venv", ".venv")
  & $python.Command @venvArgs
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $venvPython)) {
    Exit-WithError "Python 环境创建失败。请确认 Python 安装完整。"
  }
}

$requirementsHash = Get-Sha256 (Join-Path $ProjectRoot "backend\requirements.txt")
$requirementsStamp = Join-Path $LauncherDir "requirements.sha256"
$savedRequirementsHash = if (Test-Path -LiteralPath $requirementsStamp) {
  (Get-Content -LiteralPath $requirementsStamp -Raw).Trim()
} else {
  ""
}
if ($requirementsHash -ne $savedRequirementsHash) {
  Write-Host "正在安装 AI 文档解析依赖..."
  & $venvPython -m pip install `
    --disable-pip-version-check `
    -r (Join-Path $ProjectRoot "backend\requirements.txt")
  if ($LASTEXITCODE -ne 0) {
    Exit-WithError "Python 依赖安装失败。请检查网络后重试，或双击 start-zhijuan.cmd 查看日志。"
  }
  Set-Content -LiteralPath $requirementsStamp -Value $requirementsHash
}

$npmCommand = Join-Path (Split-Path -Parent $node) "npm.cmd"
if (-not (Test-Path -LiteralPath $npmCommand)) {
  $npmCommand = (Get-Command npm -ErrorAction SilentlyContinue).Source
}
if (-not $npmCommand) {
  Exit-WithError "未找到 npm。请重新安装 Node.js，并保留 npm 组件。"
}

$lockHash = Get-Sha256 (Join-Path $ProjectRoot "package-lock.json")
$npmStamp = Join-Path $LauncherDir "npm.sha256"
$savedNpmHash = if (Test-Path -LiteralPath $npmStamp) {
  (Get-Content -LiteralPath $npmStamp -Raw).Trim()
} else {
  ""
}
$npmInstallNeeded = (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) -or ($lockHash -ne $savedNpmHash)
if ($npmInstallNeeded) {
  Write-Host "正在安装网页依赖..."
  & $npmCommand ci
  if ($LASTEXITCODE -ne 0) {
    Exit-WithError "网页依赖安装失败。请检查网络后重试，或双击 start-zhijuan.cmd 查看日志。"
  }
  Set-Content -LiteralPath $npmStamp -Value $lockHash
}

$buildInputs = @(
  Get-Item -LiteralPath (Join-Path $ProjectRoot "package.json")
  Get-Item -LiteralPath (Join-Path $ProjectRoot "package-lock.json")
  Get-Item -LiteralPath (Join-Path $ProjectRoot "index.html")
  Get-Item -LiteralPath (Join-Path $ProjectRoot "vite.config.ts")
  Get-Item -LiteralPath (Join-Path $ProjectRoot "tsconfig.json")
) + @(
  Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "src") -Recurse -File
) + @(
  Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "public") -Recurse -File
)
$latestBuildInput = ($buildInputs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
$distIndex = Join-Path $ProjectRoot "dist\index.html"
$buildNeeded = (-not (Test-Path -LiteralPath $distIndex))
if (-not $buildNeeded) {
  $distTime = (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc
  $buildNeeded = $latestBuildInput.LastWriteTimeUtc -gt $distTime
}

if ($buildNeeded) {
  Write-Host "正在准备知卷页面..."
  & $npmCommand run build
  if ($LASTEXITCODE -ne 0) {
    Exit-WithError "知卷构建失败。请双击 start-zhijuan.cmd 查看详细错误。"
  }
}

$existingPort = 0
if (Test-Path -LiteralPath $PortFile) {
  [int]::TryParse((Get-Content -LiteralPath $PortFile -Raw).Trim(), [ref]$existingPort) | Out-Null
  if ($existingPort -gt 0 -and (Test-AppEndpoint -Port $existingPort)) {
    Open-App -Port $existingPort
    exit 0
  }
}

$port = 8010
while (-not (Test-PortAvailable -Port $port)) {
  $port++
  if ($port -gt 8090) {
    Exit-WithError "8010 到 8090 端口都被占用，无法启动本地服务。"
  }
}

Set-Content -LiteralPath $PortFile -Value $port
Set-Content -LiteralPath $StdoutLog -Value ""
Set-Content -LiteralPath $StderrLog -Value ""

$serverArgs = @(
  "-m",
  "uvicorn",
  "backend.server:app",
  "--host",
  "127.0.0.1",
  "--port",
  "$port"
)
$server = Start-Process `
  -FilePath $venvPython `
  -ArgumentList $serverArgs `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog `
  -PassThru
Set-Content -LiteralPath $PidFile -Value $server.Id

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (Test-AppEndpoint -Port $port) {
    $ready = $true
    break
  }
  if ($server.HasExited) {
    break
  }
}

if (-not $ready) {
  $details = ""
  if (Test-Path -LiteralPath $StderrLog) {
    $details = (Get-Content -LiteralPath $StderrLog -Tail 8) -join "`n"
  }
  Exit-WithError "本地服务没有成功启动。$details"
}

Open-App -Port $port
