param([Parameter(Mandatory=$true)][string]$VersionName)

$ErrorActionPreference = 'Stop'
$versionFile = Join-Path $PSScriptRoot 'version.properties'
$current = ConvertFrom-StringData (Get-Content -LiteralPath $versionFile -Raw)
if ($VersionName -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'Use a three-part version such as 1.1.1 or 1.2.0.'
}
if ([version]$VersionName -le [version]$current.versionName) {
    throw 'The new versionName must be higher than the current version.'
}
$nextCode = [int]$current.versionCode + 1
if ($nextCode -gt 2100000000) { throw 'Android versionCode limit exceeded.' }
@("versionCode=$nextCode", "versionName=$VersionName", "minSdk=$($current.minSdk)") |
    Set-Content -LiteralPath $versionFile -Encoding ascii
Write-Output "Version: $($current.versionName) -> $VersionName (versionCode $nextCode)"
