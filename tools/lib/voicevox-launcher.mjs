import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function findVoicevoxCandidates() {
  const candidates = [];
  const seen = new Set();

  function addCandidate(exePath, kind) {
    if (!exePath) return;
    const resolved = path.resolve(exePath);
    if (seen.has(resolved)) return;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        seen.add(resolved);
        candidates.push({ exePath: resolved, kind });
      }
    } catch {
      // ignore inaccessible path
    }
  }

  const customPath = process.env.VOICEVOX_ENGINE_PATH;
  if (customPath) {
    const isApp = path.basename(customPath).toLowerCase() === 'voicevox.exe';
    addCandidate(customPath, isApp ? 'app' : 'engine');
  }

  const appData = process.env.APPDATA || '';
  if (appData) {
    const enginesDir = path.join(appData, 'voicevox', 'vvpp-engines');
    try {
      if (fs.existsSync(enginesDir)) {
        const entries = fs.readdirSync(enginesDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .sort((a, b) => {
            const aPref = a.name.startsWith('VOICEVOX_Engine') ? 0 : 1;
            const bPref = b.name.startsWith('VOICEVOX_Engine') ? 0 : 1;
            return aPref - bPref || a.name.localeCompare(b.name);
          });
        for (const entry of entries) {
          addCandidate(path.join(enginesDir, entry.name, 'run.exe'), 'engine');
        }
      }
    } catch {
      // ignore unreadable vvpp-engines
    }
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    addCandidate(path.join(localAppData, 'Programs', 'VOICEVOX', 'vv-engine', 'run.exe'), 'engine');
  }
  addCandidate('C:\\Program Files\\VOICEVOX\\vv-engine\\run.exe', 'engine');

  if (localAppData) {
    addCandidate(path.join(localAppData, 'Programs', 'VOICEVOX', 'VOICEVOX.exe'), 'app');
  }
  addCandidate('C:\\Program Files\\VOICEVOX\\VOICEVOX.exe', 'app');

  return candidates;
}

export async function probeVoicevox(voicevoxUrl, timeoutMs = 2000) {
  const base = String(voicevoxUrl || 'http://127.0.0.1:50021').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const raw = (await res.text()).trim();
    let version = raw;
    try {
      version = JSON.parse(raw);
    } catch {
      // keep raw string
    }
    return { ok: true, version: String(version) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function ensureVoicevoxReady({
  voicevoxUrl = 'http://127.0.0.1:50021',
  autoStart = process.env.VOICEVOX_AUTO_START !== '0',
  timeoutMs = 45000,
  logger = console,
} = {}) {
  const baseUrl = String(voicevoxUrl).replace(/\/$/, '');
  const initial = await probeVoicevox(baseUrl);
  if (initial.ok) {
    return { version: initial.version, autoStarted: false, pid: null, exePath: null };
  }

  if (!autoStart) {
    throw new Error(
      `VOICEVOX Engine (${baseUrl}) に接続できません（自動起動は無効化されています）。` +
      `アプリを起動するか --no-auto-start / VOICEVOX_AUTO_START=0 を外して再実行してください。(${initial.error})`
    );
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`VOICEVOX URL が不正です: ${baseUrl}`);
  }

  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(
      `リモート先 (${baseUrl}) の VOICEVOX は自動起動できません。接続先を起動してから再実行してください。(${initial.error})`
    );
  }

  const candidates = findVoicevoxCandidates();
  if (candidates.length === 0) {
    throw new Error(
      `VOICEVOX Engine (${baseUrl}) が未起動で、ローカル実行ファイルも見つかりません。` +
      `VOICEVOX をインストール・起動するか、環境変数 VOICEVOX_ENGINE_PATH を指定してください。`
    );
  }

  const cand = candidates[0];
  const hostArg = parsed.hostname === '::1' || parsed.hostname === '[::1]' ? '127.0.0.1' : parsed.hostname;
  const portArg = parsed.port || (parsed.protocol === 'https:' ? '443' : '50021');
  const args = cand.kind === 'engine' ? ['--host', hostArg, '--port', portArg] : [];

  logger.log(`[INFO] VOICEVOX Engine が未起動のため自動起動します (${cand.kind}): ${cand.exePath}`);
  const child = spawn(cand.exePath, args, {
    cwd: path.dirname(cand.exePath),
    detached: true,
    stdio: 'ignore',
    windowsHide: cand.kind === 'engine',
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  let lastError = initial.error;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const probe = await probeVoicevox(baseUrl, 2000);
    if (probe.ok) {
      logger.log(`[INFO] VOICEVOX Engine 起動完了 (version: ${probe.version})`);
      return {
        version: probe.version,
        autoStarted: true,
        pid: child.pid ?? null,
        exePath: cand.exePath,
      };
    }
    lastError = probe.error;
  }

  throw new Error(
    `VOICEVOX Engine の自動起動がタイムアウトしました (${Math.round(timeoutMs / 1000)}s): ${cand.exePath} -> ${baseUrl} (${lastError})`
  );
}
