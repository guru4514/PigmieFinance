$ErrorActionPreference = 'Stop'
$stagingConfigPath = Join-Path $PSScriptRoot '..\.env.staging'
$stagingConfigText = [System.IO.File]::ReadAllText($stagingConfigPath)
if ($stagingConfigText -notmatch '(?m)^STAGING_PROJECT_REF=sjelnxrlkrvwjcgqbvre\r?$') {
    throw 'This helper only configures the confirmed new staging project.'
}
if ([regex]::Matches($stagingConfigText, 'REPLACE_WITH_URL_ENCODED_PASSWORD').Count -ne 2) {
    throw 'The two password placeholders were not found. Preserve the current configuration and review it first.'
}

$stagingPasswordInput = Read-Host 'Paste the database password you saved for pigmie-finance-staging (input is hidden)' -AsSecureString
$stagingPasswordPointer = [IntPtr]::Zero
try {
    $stagingPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stagingPasswordInput)
    $stagingPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stagingPasswordPointer)
    if ([string]::IsNullOrWhiteSpace($stagingPasswordText)) { throw 'The password cannot be empty.' }
    $stagingEncodedPassword = [Uri]::EscapeDataString($stagingPasswordText)
    $stagingConfigText = $stagingConfigText.Replace('REPLACE_WITH_URL_ENCODED_PASSWORD', $stagingEncodedPassword)
    [System.IO.File]::WriteAllText($stagingConfigPath, $stagingConfigText, [Text.UTF8Encoding]::new($false))
    Write-Host 'Staging password saved in the ignored local configuration. No database changes were made.'
} finally {
    if ($stagingPasswordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stagingPasswordPointer)
    }
    $stagingPasswordText = $null
    $stagingEncodedPassword = $null
    $stagingConfigText = $null
    $stagingPasswordInput.Dispose()
}
