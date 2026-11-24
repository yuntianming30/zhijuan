param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path -LiteralPath $InputPath).Path
$target = [System.IO.Path]::GetFullPath($OutputPath)

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Input file not found: $source"
}

$targetDirectory = Split-Path -Parent $target
if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
}

$powerPoint = $null
$presentation = $null

try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $presentation = $powerPoint.Presentations.Open($source, $true, $false, $false)
    $presentation.SaveAs($target, 32)
    Write-Output "Rendered to $target"
}
finally {
    if ($null -ne $presentation) {
        $presentation.Close() | Out-Null
    }
    if ($null -ne $powerPoint) {
        $powerPoint.Quit() | Out-Null
    }
}
