import { spawn } from 'node:child_process';

/**
 * Prevents Windows from sleeping or idling down during long renders without disabling lock screen security.
 * Safe no-op on non-Windows platforms.
 */
export function startKeepAwake() {
  if (process.platform !== 'win32') {
    return { stop() {} };
  }

  const psScript = [
    '$code = @"\nusing System;\nusing System.Runtime.InteropServices;\npublic static class KeepAwakeNative {\n  [DllImport("kernel32.dll", SetLastError = true)]\n  public static extern uint SetThreadExecutionState(uint esFlags);\n}\n"@',
    'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null',
    '$ES_CONTINUOUS = [uint32]::Parse("80000000", [System.Globalization.NumberStyles]::HexNumber)',
    '$ES_SYSTEM_REQUIRED = [uint32]1',
    '$flags = $ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED',
    '[void][KeepAwakeNative]::SetThreadExecutionState($flags)',
    'while ([Console]::In.ReadLine() -ne $null) {}',
    '[void][KeepAwakeNative]::SetThreadExecutionState($ES_CONTINUOUS)',
  ].join('; ');

  let child = null;
  let stopped = false;

  try {
    child = spawn(
      'powershell',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript],
      {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      }
    );
    child.on('error', () => {
      // ignore if powershell spawn fails
    });
  } catch {
    child = null;
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (!child) return;
      try {
        child.stdin?.end();
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill();
        } catch {
          // ignore
        }
      }, 200).unref();
    },
  };
}
