[CmdletBinding()]
param(
    [ValidateSet('Launcher','Mongo','App')][string]$Mode = 'Launcher',
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mongoExe = Join-Path $project '.local-tools\mongodb\mongod.exe'
$databaseDir = Join-Path $project '.local-tools\mongodb\data'
$npmCli = Join-Path $project '.local-tools\npm\node_modules\npm\bin\npm-cli.js'
Set-Location -LiteralPath $project

if ($Mode -eq 'Mongo') {
    $Host.UI.RawUI.WindowTitle = 'CivicTrack - MongoDB logs'
    Write-Host 'MongoDB is starting. Keep this window open. Press Ctrl+C to stop MongoDB.'
    & $mongoExe --dbpath $databaseDir --bind_ip 127.0.0.1 --port 27017 --replSet civictrack-rs
    Write-Host ('MongoDB exited with code ' + $LASTEXITCODE + '. This window remains open for review.')
    return
}
if ($Mode -eq 'App') {
    $Host.UI.RawUI.WindowTitle = 'CivicTrack - application logs'
    Write-Host 'Starting CivicTrack. Keep this window open. Press Ctrl+C to stop the application.'
    # npm invokes "node" in a child shell. This PATH change is limited to this window.
    $env:Path = (Split-Path -Parent $NodePath) + ';' + $env:Path
    & $NodePath $npmCli start
    Write-Host ('CivicTrack exited with code ' + $LASTEXITCODE + '. This window remains open for review.')
    return
}

function Find-Node {
    $local = Join-Path $project '.local-tools\node\node.exe'
    $candidates = @()
    if (Test-Path -LiteralPath $local -PathType Leaf) { $candidates += $local }
    # This exact Codex runtime was inspected and verified for this installation.
    $verifiedRuntime = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1116-1210-0_26.1116.1210.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe'
    $candidates += $verifiedRuntime
    $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($onPath -and $onPath.Source -like '*OpenAI.CodexPrimaryRuntime*') { $candidates += $onPath.Source }
    # Codex supplied the verified runtime used for this project's installation.
    $runtimeRoot = Join-Path $env:ProgramFiles 'WindowsApps'
    $runtimes = @(Get-ChildItem -LiteralPath $runtimeRoot -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    foreach ($runtime in $runtimes) { $candidates += (Join-Path $runtime.FullName 'dependencies\node\bin\node.exe') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            try { $null = & $candidate --version 2>$null; if ($LASTEXITCODE -eq 0) { return $candidate } } catch { }
        }
    }
    throw 'Node.js was not found in .local-tools\node or the available Codex runtime. Restore the verified runtime or install Node.js and update the launcher.'
}

function Get-Listener([int]$port) {
    return @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Check-Mongo([string]$node) {
    $check = @'
const { MongoClient } = require('mongoose').mongo;
const fs = require('fs');
const path = require('path');
(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true', { serverSelectionTimeoutMS: 1300, connectTimeoutMS: 1300 });
  try {
    await client.connect();
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    const opts = (await admin.command({ getCmdLineOpts: 1 })).parsed;
    const actual = fs.realpathSync(opts.storage.dbPath).toLowerCase();
    const expected = fs.realpathSync(path.resolve('.local-tools/mongodb/data')).toLowerCase();
    const bind = String(opts.net.bindIp || '').split(',').map(x => x.trim());
    if (actual !== expected || opts.net.port !== 27017 || bind.length !== 1 || bind[0] !== '127.0.0.1' || opts.replication.replSet !== 'civictrack-rs' || hello.setName !== 'civictrack-rs' || !hello.isWritablePrimary) process.exitCode = 1;
  } catch (_) { process.exitCode = 1; }
  finally { await client.close(); }
})();
'@
    & $node -e $check 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Is-Descendant([int]$pidToCheck, [int]$parentId) {
    $current = $pidToCheck
    for ($i=0; $i -lt 12 -and $current -gt 0; $i++) {
        if ($current -eq $parentId) { return $true }
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $process) { return $false }
        $current = [int]$process.ParentProcessId
    }
    return $false
}

$startupMutex = [System.Threading.Mutex]::new($false, 'Local\CivicTrackLauncherStartup')
$lockHeld = $false
try {
    $lockHeld = $startupMutex.WaitOne(0)
    if (-not $lockHeld) { throw 'Another CivicTrack launcher is already starting. Please wait for it to finish.' }
    foreach ($item in @($mongoExe, $databaseDir, $npmCli, (Join-Path $project 'server\server.js'), (Join-Path $project 'node_modules\mongoose'), (Join-Path $project '.env'))) {
        if (-not (Test-Path -LiteralPath $item)) { throw "Required project item is missing: $item" }
    }
    $node = Find-Node
    Write-Host ('Node.js: ' + $node)
    # Check only non-secret settings. Never print the database URI or JWT secret.
    $configCheck = @'
const fs = require('fs'); const dotenv = require('dotenv');
const e = dotenv.parse(fs.readFileSync('.env'));
const host = e.HOST || '127.0.0.1'; const port = e.PORT || '3000';
const uri = e.MONGODB_URI || '';
if (host !== '127.0.0.1' || port !== '3000' || !/^mongodb:\/\/127\.0\.0\.1:27017\/civictrack\?replicaSet=civictrack-rs$/i.test(uri) || (e.CLIENT_ORIGIN || '') !== 'http://localhost:3000') process.exitCode = 1;
'@
    & $node -e $configCheck 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'The existing .env does not match the expected local host, port, client origin or MongoDB replica-set configuration. Review it without sharing secrets.' }

    $existingListeners = @(Get-Listener 27017)
    $mongoProcesses = @(Get-CimInstance Win32_Process -Filter "Name='mongod.exe'")
    $sameDatabase = @($mongoProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($databaseDir, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    if ($existingListeners.Count -gt 0) {
        if (@($existingListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count -gt 0) { throw 'Port 27017 is listening on an unexpected address. No database was started.' }
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($existingListeners[0].OwningProcess)"
        if (-not $owner -or -not $owner.ExecutablePath -or -not [string]::Equals($owner.ExecutablePath, $mongoExe, [StringComparison]::OrdinalIgnoreCase)) { throw 'Port 27017 is occupied by a different process. No database was started.' }
        Write-Host 'Found the project MongoDB process; checking its configuration and readiness...'
    } elseif ($sameDatabase.Count -gt 0) {
        Write-Host 'A MongoDB process already references the project data directory. Waiting for it; a second instance will not be launched.'
    } elseif ($mongoProcesses.Count -gt 0) {
        throw 'A MongoDB process is running but its data directory cannot be safely verified. No additional MongoDB process was started.'
    } else {
        Write-Host 'Starting the project MongoDB in a separate window...'
        $args = @('-NoLogo','-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Mode','Mongo')
        $mongoWindow = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WorkingDirectory $project -PassThru
    }
    $ready = $false
    for ($i=0; $i -lt 60; $i++) { if (Check-Mongo $node) { $ready = $true; break }; Start-Sleep -Milliseconds 500 }
    if (-not $ready) { throw 'MongoDB did not become a writable primary with the expected data directory, bind address and replica set. Check its log window. Replica-set initialization is not performed automatically.' }
    Write-Host 'MongoDB is ready and its configuration matches this project.'

    $listeners = @(Get-Listener 3000)
    if ($listeners.Count -gt 0) { throw ('Port 3000 is already in use (PID ' + $listeners[0].OwningProcess + '). Stop the existing application if appropriate, or open http://localhost:3000 if you know it is CivicTrack.') }
    Write-Host 'Starting CivicTrack in a separate window...'
    $args = @('-NoLogo','-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Mode','App','-NodePath',('"' + $node + '"'))
    $appWindow = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WorkingDirectory $project -PassThru
    $appReady = $false
    for ($i=0; $i -lt 60; $i++) {
        $listeners = @(Get-Listener 3000)
        if ($listeners.Count -gt 0) {
            if (-not (Is-Descendant ([int]$listeners[0].OwningProcess) $appWindow.Id)) { throw 'Another process took port 3000. Check the application log window.' }
            try { $response = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/v1/categories' -TimeoutSec 2; if ($null -ne $response.data) { $appReady = $true; break } } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $appReady) { throw 'The application did not become ready. Check the CivicTrack application log window.' }
    Write-Host 'CivicTrack is ready at http://localhost:3000. Opening your browser...'
    Write-Host 'Keep both log windows open. Stop the application first with Ctrl+C in its window, then stop MongoDB with Ctrl+C in its window.'
    Start-Process 'http://localhost:3000' | Out-Null
    exit 0
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($lockHeld) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
