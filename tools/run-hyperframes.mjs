import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRecommendedSnapshots } from './lib/snapshot-plan.mjs';
import { startKeepAwake } from './lib/win-keep-awake.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const hyperframesBin = path.join(rootDir, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

async function isFileLocked(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return false;
  }
  if (process.platform === 'win32') {
    const escaped = filePath.replace(/'/g, "''");
    const res = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `try { $s = [System.IO.File]::Open('${escaped}', 'Open', 'ReadWrite', 'None'); $s.Close(); exit 0 } catch { exit 1 }`,
      ],
      { stdio: 'ignore' }
    );
    return res.status !== 0;
  }
  try {
    const fh = await fs.open(filePath, 'r+');
    await fh.close();
    return false;
  } catch (err) {
    return Boolean(err && ['EBUSY', 'EPERM', 'EACCES'].includes(err.code));
  }
}

async function resolveAvailableOutputPath(outputDir, episodeName) {
  const defaultPath = path.join(outputDir, `${episodeName}.mp4`);
  if (!(await isFileLocked(defaultPath))) {
    return defaultPath;
  }
  for (let v = 2; v <= 99; v++) {
    const candidate = path.join(outputDir, `${episodeName}_v${v}.mp4`);
    if (!(await isFileLocked(candidate))) {
      console.warn(
        `[WARN] ${path.relative(rootDir, defaultPath)} が別プロセスで開かれているため、出力先を ${path.relative(rootDir, candidate)} に変更します。`
      );
      return candidate;
    }
  }
  return path.join(outputDir, `${episodeName}_${Date.now()}.mp4`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const episodeArg = args[1];

  if (!command || !episodeArg || episodeArg.startsWith('-')) {
    console.error('Usage: node tools/run-hyperframes.mjs <lint|check|preview|render|timeline|compositions|snapshot> <episodeDir> [options...]');
    process.exit(1);
  }

  const episodeDir = path.isAbsolute(episodeArg) ? episodeArg : path.resolve(rootDir, episodeArg);
  const distDir = path.join(episodeDir, 'dist');
  let extraArgs = args.slice(2).filter((arg) => arg !== '--');

  try {
    await fs.access(path.join(distDir, 'index.html'));
  } catch {
    console.error(`[ERROR] ${path.relative(rootDir, distDir)}/index.html が見つかりません。先に episode:build を実行してください。`);
    process.exit(1);
  }

  const hfArgs = [hyperframesBin, command];

  if (command === 'snapshot' && extraArgs.includes('--auto')) {
    extraArgs = extraArgs.filter((a) => a !== '--auto');
    const timelinePath = path.join(episodeDir, 'timeline.json');
    let timeline;
    try {
      timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
    } catch {
      console.error(`[ERROR] ${path.relative(rootDir, timelinePath)} が見つかりません。先に episode:audio を実行してください。`);
      process.exit(1);
    }
    let sceneSpecs = null;
    try {
      sceneSpecs = JSON.parse(await fs.readFile(path.join(episodeDir, 'scene-specs.json'), 'utf8'));
    } catch {
      // optional
    }
    const timestamps = computeRecommendedSnapshots(timeline, sceneSpecs);
    if (timestamps.length === 0) {
      console.error('[ERROR] 推奨スナップショット時刻を計算できませんでした（timeline.json を確認してください）。');
      process.exit(1);
    }
    const atCsv = timestamps.join(',');
    console.log(`[INFO] --auto 推奨スナップショット時刻 (${timestamps.length}件): ${atCsv}`);
    const hasAt = extraArgs.some((a) => a === '--at' || a.startsWith('--at='));
    if (!hasAt) {
      hfArgs.push('--at', atCsv);
    }
    const hasEndFlag = extraArgs.some((a) => a === '--no-end' || a === '--end');
    if (!hasEndFlag) {
      hfArgs.push('--no-end');
    }
  }

  let useKeepAwake = false;
  const childEnv = { ...process.env };

  if (command === 'render') {
    let isDraft = false;
    let chapterId = null;
    let segmented = false;
    let keepAwakeEnabled = true;
    const filteredArgs = [];

    for (let i = 0; i < extraArgs.length; i++) {
      const a = extraArgs[i];
      if (a === '--no-keep-awake') {
        keepAwakeEnabled = false;
      } else if (a === '--draft') {
        isDraft = true;
      } else if (a === '--segmented') {
        segmented = true;
      } else if (a === '--chapter' && extraArgs[i + 1]) {
        chapterId = extraArgs[++i];
      } else if (a.startsWith('--chapter=')) {
        chapterId = a.slice('--chapter='.length);
      } else {
        filteredArgs.push(a);
      }
    }
    extraArgs = filteredArgs;
    useKeepAwake = keepAwakeEnabled;

    if (chapterId) {
      const timelinePath = path.join(episodeDir, 'timeline.json');
      let timeline;
      try {
        timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
      } catch {
        console.error(`[ERROR] ${path.relative(rootDir, timelinePath)} が見つかりません。先に episode:audio を実行してください。`);
        process.exit(1);
      }
      const ch = (timeline.chapters || []).find((c) => c.id === chapterId);
      if (!ch) {
        console.error(`[ERROR] チャプター ID が timeline.json に見つかりません: ${chapterId}`);
        process.exit(1);
      }
      const startSec = Number(ch.start ?? 0);
      const endSec = Number(ch.end ?? (startSec + Number(ch.duration ?? 0)));
      const hasStart = extraArgs.some((a) => a === '--start' || a.startsWith('--start='));
      const hasEnd = extraArgs.some((a) => a === '--end' || a.startsWith('--end='));
      if (!hasStart) extraArgs.push('--start', String(startSec));
      if (!hasEnd) extraArgs.push('--end', String(endSec));
      console.log(`[INFO] チャプター限定レンダ: ${chapterId} (${startSec}s 〜 ${endSec}s)`);
    }

    if (isDraft) {
      const hasQuality = extraArgs.some((a) => a === '-q' || a === '--quality' || a.startsWith('--quality='));
      const hasFps = extraArgs.some((a) => a === '-f' || a === '--fps' || a.startsWith('--fps='));
      const hasRange = extraArgs.some((a) => a === '--start' || a.startsWith('--start=') || a === '--end' || a.startsWith('--end='));
      if (!hasQuality) extraArgs.push('--quality', 'draft');
      if (!hasFps) extraArgs.push('--fps', hasRange ? '24' : '15');
    }

    if (segmented) {
      childEnv.HF_SEGMENTED_CAPTURE = 'true';
      if (!extraArgs.includes('--resume')) {
        extraArgs.push('--resume');
      }
    }

    if (process.platform === 'win32') {
      const hasGpuFlag = extraArgs.some((a) => a === '--browser-gpu' || a === '--no-browser-gpu');
      if (!hasGpuFlag && process.env.HYPERFRAMES_BROWSER_GPU !== '1') {
        extraArgs.push('--no-browser-gpu');
        console.log('[INFO] Windows 画面ロック対策: --no-browser-gpu を既定適用します（GPU強制時は --browser-gpu または HYPERFRAMES_BROWSER_GPU=1）');
      }
    }

    const hasOutputFlag = extraArgs.some((a) => a === '-o' || a === '--output' || a.startsWith('--output='));
    if (!hasOutputFlag) {
      const outputDir = path.join(episodeDir, 'output');
      await fs.mkdir(outputDir, { recursive: true });
      const episodeName = path.basename(episodeDir);
      const outputStem = `${episodeName}${chapterId ? `_${chapterId}` : ''}${isDraft ? '_draft' : ''}`;
      const outputPath = await resolveAvailableOutputPath(outputDir, outputStem);
      hfArgs.push('--output', outputPath);
    }
  }

  hfArgs.push(...extraArgs);

  const keepAwake = useKeepAwake ? startKeepAwake() : { stop() {} };
  let result;
  try {
    result = spawnSync(process.execPath, hfArgs, {
      cwd: distDir,
      stdio: 'inherit',
      env: childEnv,
    });
  } finally {
    keepAwake.stop();
  }

  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 0);
}

main().catch((err) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
