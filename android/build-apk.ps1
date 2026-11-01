param([switch]$DebugBuild, [switch]$Verify)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot '.android-tools'
$versionInfo = ConvertFrom-StringData (Get-Content (Join-Path $PSScriptRoot 'version.properties') -Raw)
$bundledJdk = Get-ChildItem (Join-Path $toolsDir 'jdk17') -Directory -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($bundledJdk) { $env:JAVA_HOME = $bundledJdk.FullName }
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    throw 'Set JAVA_HOME to JDK 17 or 21 before building.'
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:GRADLE_USER_HOME = Join-Path $toolsDir 'gradle-user-home'
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $toolsDir 'sdk' }
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'platforms\android-35\android.jar'))) {
    throw 'Install Android SDK Platform 35 and Build Tools 35.0.0, then set ANDROID_HOME.'
}

if (-not $DebugBuild) {
    $signingDir = Join-Path $PSScriptRoot 'signing'
    $keyFile = Join-Path $signingDir 'booktree-release.jks'
    $propertiesFile = Join-Path $signingDir 'signing.properties'
    if ((Test-Path $keyFile) -xor (Test-Path $propertiesFile)) {
        throw 'Restore both the original keystore and signing.properties. Do not replace the release key.'
    }
    if (-not (Test-Path $keyFile)) {
        if ([int]$versionInfo.versionCode -gt 1) {
            throw 'An update must use the original release key. Restore android/signing from your backup.'
        }
        New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        $secretBytes = New-Object byte[] 32
        $random.GetBytes($secretBytes)
        $random.Dispose()
        $password = [Convert]::ToBase64String($secretBytes)
        $env:BOOKTREE_SIGNING_PASSWORD = $password
        try {
            & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $keyFile `
                -storetype JKS -alias booktree -keyalg RSA -keysize 3072 -validity 10000 `
                -dname 'CN=Booktree CBT' -storepass:env BOOKTREE_SIGNING_PASSWORD `
                -keypass:env BOOKTREE_SIGNING_PASSWORD -noprompt
            if ($LASTEXITCODE -ne 0) { throw 'Release signing key creation failed.' }
            @("keyAlias=booktree", "storePassword=$password", "keyPassword=$password") |
                Set-Content -LiteralPath $propertiesFile -Encoding ascii
        } finally {
            Remove-Item Env:BOOKTREE_SIGNING_PASSWORD -ErrorAction SilentlyContinue
            $password = $null
        }
    }
}

$variant = if ($DebugBuild) { 'debug' } else { 'release' }
$task = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
Push-Location $PSScriptRoot
try {
    $gradle = Join-Path $toolsDir 'gradle-8.11.1\bin\gradle.bat'
    if (-not (Test-Path $gradle)) { $gradle = Join-Path $PSScriptRoot 'gradlew.bat' }
    $gradleArguments = @('--no-daemon', '--console=plain', $task)
    if ($Verify) {
        $gradleArguments += if ($DebugBuild) { @('testDebugUnitTest', 'lintDebug') } else { @('testReleaseUnitTest', 'lintRelease') }
    }
    & $gradle @gradleArguments
    if ($LASTEXITCODE -ne 0) { throw 'APK build failed.' }
} finally {
    Pop-Location
}

$outputDir = Join-Path $PSScriptRoot "app\build\outputs\apk\$variant"
$metadata = Get-Content (Join-Path $outputDir 'output-metadata.json') -Raw | ConvertFrom-Json
$element = $metadata.elements[0]
$suffix = if ($DebugBuild) { '-debug' } else { '' }
$distDir = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$apkFile = Join-Path $distDir "booktree-$($element.versionName)$suffix.apk"
Copy-Item -LiteralPath (Join-Path $outputDir $element.outputFile) -Destination $apkFile -Force
$hash = (Get-FileHash -LiteralPath $apkFile -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($apkFile))" |
    Set-Content -LiteralPath "$apkFile.sha256" -Encoding ascii
Write-Output "APK: $apkFile"
Write-Output "SHA256: $hash"

if (-not $DebugBuild) {
    $versionName = [string]$element.versionName
    if ($versionName -ne $versionInfo.versionName -or [int]$element.versionCode -ne [int]$versionInfo.versionCode) {
        throw 'APK metadata does not match version.properties.'
    }
    $update = [ordered]@{
        schemaVersion = 1
        versionCode = [int]$element.versionCode
        versionName = $versionName
        minSdk = [int]$versionInfo.minSdk
        apkUrl = "https://github.com/wanzanggmail/booktree/releases/download/android-v$versionName/booktree-$versionName.apk"
        sha256 = $hash
        sizeBytes = (Get-Item -LiteralPath $apkFile).Length
        releaseNotes = (Get-Content (Join-Path $PSScriptRoot 'release-notes.txt') -Raw -Encoding UTF8).Trim()
        builtAt = [DateTime]::UtcNow.ToString('o')
    }
    $updateDir = Join-Path $projectRoot 'updates'
    New-Item -ItemType Directory -Force -Path $updateDir | Out-Null
    $json = ($update | ConvertTo-Json -Depth 4) + [Environment]::NewLine
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $updateDir 'latest.json'), $json, $utf8)
    [IO.File]::WriteAllText((Join-Path $distDir 'latest.json'), $json, $utf8)
    Write-Output 'Update manifest: updates/latest.json'
    Write-Output "Release tag: android-v$versionName"
}
