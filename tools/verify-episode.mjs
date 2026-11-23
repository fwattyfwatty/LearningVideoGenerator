import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { computeRecommendedSnapshots } from './lib/snapshot-plan.mjs';
import { runBrowserSmokeCheck } from './lib/browser-smoke.mjs';
import { applyDictionary, loadMergedDictionary } from './lib/text-reading.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const BAD_METAN_TONE_RE = /ですわ|ますわ|のですわ|ますの(?!で)|ですのよ|わよ/;
const ASCII_TOKEN_RE = /\b[A-Za-z]{2,}\b/g;
const SAFE_ASCII_ALLOWLIST = new Set([
  'ON', 'OFF', 'OK', 'AI', 'OS', 'PC', 'TV', 'VR', 'AR', 'IT', 'IoT', 'UI', 'UX',
  'mm', 'cm', 'km', 'kg', 'Hz', 'GHz', 'MHz', 'GB', 'TB', 'MB', 'KB',
  'LED', 'USB', 'CPU', 'GPU', 'RAM', 'ROM', 'SSD', 'API', 'URL', 'SQL', 'LLM',
]);

const PORTRAIT_CROPS = [
  { name: 'Metan', crop: 'crop=276:266:12:814' },
  { name: 'Zundamon', crop: 'crop=260:266:1648:814' },
  { name: 'Tsumugi', crop: 'crop=344:164:1544:90' },
];

const FLICKER_W = 32;
const FLICKER_H = 32;
const FLICKER_FRAME_BYTES = FLICKER_W * FLICKER_H;

function calcVisualWidth(text) {
  let w = 0;
  for (const ch of String(text || '')) {
    w += /[\u0020-\u007E]/.test(ch) ? 0.55 : 1.0;
  }
  return w;
}

function parseArgs(argv) {
  let episodeArg = null;
  let stage = 'all';
  let videoArg = null;
  let gridArg = null;
  let jsonOutput = false;
  let browserSmoke = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (a.startsWith('--stage=')) {
      stage = a.slice('--stage='.length);
    } else if (a === '--video' && argv[i + 1]) {
      videoArg = argv[++i];
    } else if (a.startsWith('--video=')) {
      videoArg = a.slice('--video='.length);
    } else if (a === '--grid' && argv[i + 1]) {
      gridArg = argv[++i];
    } else if (a.startsWith('--grid=')) {
      gridArg = a.slice('--grid='.length);
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (a === '--no-browser') {
      browserSmoke = false;
    } else if (!a.startsWith('-') && !episodeArg) {
      episodeArg = a;
    }
  }

  if (!episodeArg || !['script', 'pre', 'post', 'all'].includes(stage)) {
    console.error('Usage: node tools/verify-episode.mjs <episodeDir> [--stage script|pre|post|all] [--video <mp4Path>] [--grid <jpgPath>] [--no-browser] [--json]');
    process.exit(1);
  }

  return {
    episodeDir: path.isAbsolute(episodeArg) ? episodeArg : path.resolve(rootDir, episodeArg),
    stage,
    videoPath: videoArg ? (path.isAbsolute(videoArg) ? videoArg : path.resolve(rootDir, videoArg)) : null,
    gridPath: gridArg ? (path.isAbsolute(gridArg) ? gridArg : path.resolve(rootDir, gridArg)) : null,
    jsonOutput,
    browserSmoke,
  };
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runPreChecks(episodeDir, { scriptOnly = false, browserSmoke = true } = {}) {
  const errors = [];
  const warnings = [];
  const info = [];

  const scriptPath = path.join(episodeDir, 'script.yaml');
  if (!(await fileExists(scriptPath))) {
    errors.push(`script.yaml が見つかりません: ${scriptPath}`);
    return { errors, warnings, info, snapshotAt: [] };
  }

  const script = yaml.load(await fs.readFile(scriptPath, 'utf8'));
  const characters = yaml.load(await fs.readFile(path.join(rootDir, 'config', 'characters.yaml'), 'utf8'));
  const dictionary = await loadMergedDictionary(rootDir, episodeDir);

  const chapters = Array.isArray(script?.chapters) ? script.chapters : [];
  if (chapters.length === 0) {
    errors.push('script.yaml に chapters が定義されていません。');
  }

  const unresolvedAscii = new Set();
  const checkedEmotions = new Map();
  let totalLines = 0;

  for (const ch of chapters) {
    const chId = ch.id || '(no id)';
    if (!scriptOnly) {
      const scenePath = path.join(episodeDir, 'scenes', `${chId}.html`);
      if (!(await fileExists(scenePath))) {
        errors.push(`図解シーンが見つかりません: ${path.relative(rootDir, scenePath)}`);
      }
    }

    const lines = Array.isArray(ch.lines) ? ch.lines : [];
    for (let i = 0; i < lines.length; i++) {
      totalLines++;
      const line = lines[i];
      const loc = `${chId}#line${i + 1}`;
      const speaker = line.speaker;
      const charDef = characters?.[speaker];

      if (!charDef) {
        errors.push(`${loc}: 未定義の speaker "${speaker}"`);
        continue;
      }

      if (line.style && line.style !== 'normal') {
        errors.push(`${loc}: VOICEVOX style は "normal" 固定です (検出値: "${line.style}")`);
      }

      if (speaker === 'metan') {
        for (const field of ['caption', 'voice_text']) {
          if (line[field] && BAD_METAN_TONE_RE.test(line[field])) {
            errors.push(`${loc}: めたんの${field}にお嬢様口調が含まれています ("${line[field]}")`);
          }
        }
      }

      const emotion = line.emotion || charDef.default_emotion || 'normal';
      const emoKey = `${speaker}:${emotion}`;
      if (!checkedEmotions.has(emoKey)) {
        const srcBase = charDef.portraits_dir
          ? path.resolve(rootDir, charDef.portraits_dir)
          : path.join(rootDir, 'assets', 'characters', 'exported', speaker);
        const closedOk = await fileExists(path.join(srcBase, `${emotion}_closed.png`));
        const openOk = await fileExists(path.join(srcBase, `${emotion}_open.png`));
        checkedEmotions.set(emoKey, closedOk && openOk);
      }
      if (!checkedEmotions.get(emoKey)) {
        errors.push(`${loc}: ${speaker} の立ち絵 PNG が不足しています (emotion="${emotion}")`);
      }

      const captionText = line.caption || '';
      const visualW = calcVisualWidth(captionText);
      if (visualW > 76) {
        warnings.push(
          `${loc}: 字幕が3行折り返し域です (全角換算 ${visualW.toFixed(1)}文字 / ${captionText.length}文字) — 情報を削らず2セリフへの分割を強く推奨（表示時は自動でフォント微縮小）`
        );
      } else if (visualW > 64) {
        warnings.push(
          `${loc}: 字幕が2行目安を超えています (全角換算 ${visualW.toFixed(1)}文字 / ${captionText.length}文字) — 情報を削らず2セリフへの分割を推奨`
        );
      }

      const reading = applyDictionary(line.voice_text || line.caption || '', dictionary);
      const matches = reading.match(ASCII_TOKEN_RE);
      if (matches) {
        for (const tok of matches) {
          if (!SAFE_ASCII_ALLOWLIST.has(tok)) {
            unresolvedAscii.add(tok);
          }
        }
      }
    }
  }

  if (unresolvedAscii.size > 0) {
    warnings.push(
      `辞書未登録の可能性が高い英字語句: ${Array.from(unresolvedAscii).sort().join(', ')} (config/dictionary.yaml を確認)`
    );
  }

  const distIndex = path.join(episodeDir, 'dist', 'index.html');
  let lintSummary = null;
  if (!scriptOnly && await fileExists(distIndex)) {
    const lintRes = spawnSync(
      process.execPath,
      [path.join(rootDir, 'tools', 'run-hyperframes.mjs'), 'lint', episodeDir, '--json'],
      { cwd: rootDir, encoding: 'utf8' }
    );
    const outText = (lintRes.stdout || '').trim() || (lintRes.stderr || '').trim();
    const jsonStart = outText.indexOf('{');
    const jsonEnd = outText.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        lintSummary = JSON.parse(outText.slice(jsonStart, jsonEnd + 1));
        if (!lintSummary.ok || lintSummary.errorCount > 0 || lintSummary.warningCount > 0) {
          errors.push(
            `HyperFrames lint エラー/警告: errorCount=${lintSummary.errorCount}, warningCount=${lintSummary.warningCount}`
          );
        } else {
          info.push(`HyperFrames lint OK (filesScanned=${lintSummary.filesScanned}, errors=0, warnings=0)`);
        }
      } catch {
        warnings.push('HyperFrames lint のJSON出力を解析できませんでした。');
      }
    } else if (lintRes.status !== 0) {
      errors.push(`HyperFrames lint が失敗しました (exit=${lintRes.status})`);
    }
  } else if (!scriptOnly) {
    warnings.push('dist/index.html が未ビルドのため HyperFrames lint をスキップしました。');
  }

  let snapshotAt = [];
  let timeline = null;
  let sceneSpecs = null;
  const timelinePath = path.join(episodeDir, 'timeline.json');
  if (!scriptOnly && await fileExists(timelinePath)) {
    timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
    const specsPath = path.join(episodeDir, 'scene-specs.json');
    if (await fileExists(specsPath)) {
      try {
        sceneSpecs = JSON.parse(await fs.readFile(specsPath, 'utf8'));
      } catch {
        // ignore malformed scene-specs
      }
    }
    snapshotAt = computeRecommendedSnapshots(timeline, sceneSpecs);
  }

  if (!scriptOnly && browserSmoke && await fileExists(distIndex) && timeline) {
    const smoke = await runBrowserSmokeCheck(episodeDir, timeline, sceneSpecs);
    if (smoke.info?.length) info.push(...smoke.info);
    if (smoke.warnings?.length) warnings.push(...smoke.warnings);
    if (smoke.errors?.length) errors.push(...smoke.errors);
  }

  info.unshift(`台本検査完了: ${chapters.length}チャプター / ${totalLines}セリフ`);
  return { errors, warnings, info, snapshotAt, lintSummary };
}

async function resolveTargetVideo(episodeDir, explicitVideoPath) {
  if (explicitVideoPath) {
    return (await fileExists(explicitVideoPath)) ? explicitVideoPath : null;
  }
  const outputDir = path.join(episodeDir, 'output');
  if (!(await fileExists(outputDir))) return null;
  const entries = await fs.readdir(outputDir);
  const mp4Candidates = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.mp4')) continue;
    const full = path.join(outputDir, name);
    const stat = await fs.stat(full);
    mp4Candidates.push({ full, mtimeMs: stat.mtimeMs });
  }
  if (mp4Candidates.length === 0) return null;
  mp4Candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return mp4Candidates[0].full;
}

function runFfprobe(videoPath) {
  const res = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration,size,bit_rate',
      '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
      '-of', 'json',
      videoPath,
    ],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

function runVolumedetect(videoPath) {
  const res = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', videoPath, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const output = `${res.stderr || ''}\n${res.stdout || ''}`;
  const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const maxMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);
  if (!meanMatch || !maxMatch) {
    throw new Error('volumedetect の結果を解析できませんでした。');
  }
  return {
    meanVolumeDb: Number(meanMatch[1]),
    maxVolumeDb: Number(maxMatch[1]),
  };
}

function buildCutinTransitionWindows(timeline) {
  const boundaries = [];
  const cutinWindows = [];
  const chapters = Array.isArray(timeline?.chapters) ? timeline.chapters : [];

  for (let c = 0; c < chapters.length; c++) {
    const ch = chapters[c];
    const chStart = Number(ch.start) || 0;
    const chDur = Math.max(0.5, Number(ch.duration) || 1);
    if (c > 0) boundaries.push(chStart);

    const lines = Array.isArray(ch.lines) ? ch.lines : [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const nextLine = lines[i + 1];
      if (l.speaker === 'tsumugi' || l.mode === 'cutin') {
        const prevIsTsumugi = i > 0 && (lines[i - 1].speaker === 'tsumugi' || lines[i - 1].mode === 'cutin');
        const nextIsTsumugi = nextLine && (nextLine.speaker === 'tsumugi' || nextLine.mode === 'cutin');
        if (!prevIsTsumugi) {
          const enterAt = chStart + Math.max(0, Number(l.start) - 0.25);
          cutinWindows.push([enterAt - 0.35, enterAt + 0.35]);
        }
        if (!nextIsTsumugi) {
          const exitAt = chStart + Math.min(chDur - 0.22, Number(l.end) + 0.32);
          cutinWindows.push([exitAt - 0.35, exitAt + 0.35]);
        }
      }
    }
  }
  return { boundaries, cutinWindows };
}

function meanFrameStats(bufA, bufB) {
  let diff = 0;
  let sumA = 0;
  for (let i = 0; i < FLICKER_FRAME_BYTES; i++) {
    sumA += bufA[i];
    diff += Math.abs(bufA[i] - bufB[i]);
  }
  return { mad: diff / FLICKER_FRAME_BYTES, meanLumaA: sumA / FLICKER_FRAME_BYTES };
}

function scanPortraitCrop(videoPath, cropInfo, fps, boundaries, cutinWindows) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-i', videoPath,
      '-vf', `${cropInfo.crop},scale=${FLICKER_W}:${FLICKER_H}:flags=area,format=gray`,
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      '-',
    ]);

    let pending = Buffer.alloc(0);
    let prev2 = null;
    let prev1 = null;
    let frameIdx = 0;
    const alphaDipFlickers = [];
    const motionSpikes = [];
    let stderrText = '';

    proc.stderr.on('data', (chunk) => {
      stderrText += chunk.toString('utf8');
    });

    const processFrame = (curr) => {
      const currIdx = frameIdx++;
      if (prev2 && prev1) {
        const midIdx = currIdx - 1;
        const t = midIdx / fps;
        if (!prev2.equals(prev1) && !prev1.equals(curr)) {
          const sAB = meanFrameStats(prev2, prev1);
          const sBC = meanFrameStats(prev1, curr);
          const sAC = meanFrameStats(prev2, curr);
          const sMid = meanFrameStats(prev1, prev1);
          const lumaMid = sMid.meanLumaA;
          const sCurr = meanFrameStats(curr, curr);
          const minEdge = Math.min(sAB.mad, sBC.mad);

          if (minEdge > 1.2 && sAC.mad < 0.45 * minEdge) {
            const nearBoundary = boundaries.some((b) => Math.abs(t - b) < 0.15);
            const inCutinSlide = cropInfo.name === 'Tsumugi' && cutinWindows.some(([w0, w1]) => t >= w0 && t <= w1);
            const lumaDip = Math.abs(lumaMid - (sAB.meanLumaA + sCurr.meanLumaA) / 2);

            const rec = {
              actor: cropInfo.name,
              frame: midIdx,
              time: Number(t.toFixed(3)),
              d_ab: Number(sAB.mad.toFixed(3)),
              d_bc: Number(sBC.mad.toFixed(3)),
              d_ac: Number(sAC.mad.toFixed(3)),
              lumaDip: Number(lumaDip.toFixed(3)),
              nearBoundary,
              inCutinSlide,
            };

            motionSpikes.push(rec);
            if (!nearBoundary && !inCutinSlide && minEdge > 2.0 && sAC.mad < 0.35 * minEdge && lumaDip > 2.0) {
              alphaDipFlickers.push(rec);
            }
          }
        }
      }
      prev2 = prev1;
      prev1 = curr;
    };

    proc.stdout.on('data', (chunk) => {
      pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;
      while (offset + FLICKER_FRAME_BYTES <= pending.length) {
        const frame = Buffer.from(pending.subarray(offset, offset + FLICKER_FRAME_BYTES));
        processFrame(frame);
        offset += FLICKER_FRAME_BYTES;
      }
      pending = offset > 0 ? Buffer.from(pending.subarray(offset)) : pending;
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg flicker scan failed (${cropInfo.name}, exit=${code}): ${stderrText}`));
        return;
      }
      resolve({
        actor: cropInfo.name,
        frames: frameIdx,
        alphaDipFlickers,
        motionSpikes,
      });
    });
  });
}

async function generateVerificationGrid(videoPath, timeline, duration, gridPath) {
  const maxT = Math.max(2, duration - 1);
  const clampT = (t) => Number(Math.min(maxT, Math.max(1, t)).toFixed(2));
  let timestamps = [];

  const chapters = Array.isArray(timeline?.chapters) ? timeline.chapters : [];
  if (chapters.length >= 4) {
    const chosen = chapters.length >= 6
      ? [chapters[1], chapters[2], chapters[3], chapters[4]]
      : [0, 1, 2, 3].map((k) => chapters[Math.floor((k * chapters.length) / 4)]);

    for (const ch of chosen) {
      const chStart = Number(ch.start) || 0;
      const lines = Array.isArray(ch.lines) ? ch.lines : [];
      const cutinLine = [...lines].reverse().find((l) => l.mode === 'cutin' || l.speaker === 'tsumugi');
      const targetLine = cutinLine || lines[Math.min(lines.length - 1, Math.floor(lines.length * 0.8))];
      const localT = targetLine
        ? Math.min(targetLine.end - 0.5, targetLine.start + 2.0)
        : (Number(ch.duration) || 10) * 0.75;
      timestamps.push(clampT(chStart + localT));
    }
  } else {
    timestamps = [0.15, 0.4, 0.65, 0.9].map((r) => clampT(duration * r));
  }

  await fs.mkdir(path.dirname(gridPath), { recursive: true });
  const ffArgs = ['-y', '-v', 'error'];
  for (const t of timestamps) {
    ffArgs.push('-ss', String(t), '-i', videoPath);
  }
  ffArgs.push(
    '-filter_complex', '[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,scale=1920:1080[v]',
    '-map', '[v]',
    '-frames:v', '1',
    '-q:v', '3',
    gridPath
  );

  const res = spawnSync('ffmpeg', ffArgs, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`verification grid ffmpeg failed: ${res.stderr || res.stdout}`);
  }
  return { path: gridPath, timestamps };
}

async function runPostChecks(episodeDir, explicitVideoPath, gridPath = null) {
  const errors = [];
  const warnings = [];
  const info = [];

  const videoPath = await resolveTargetVideo(episodeDir, explicitVideoPath);
  if (!videoPath) {
    errors.push('検証対象の MP4 が見つかりませんでした。');
    return { errors, warnings, info };
  }

  let timeline = null;
  const timelinePath = path.join(episodeDir, 'timeline.json');
  if (await fileExists(timelinePath)) {
    timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
  }

  const probe = runFfprobe(videoPath);
  const vStream = (probe.streams || []).find((s) => s.codec_type === 'video');
  const aStream = (probe.streams || []).find((s) => s.codec_type === 'audio');
  const duration = Number(probe.format?.duration || 0);

  if (!vStream || vStream.codec_name !== 'h264' || vStream.width !== 1920 || vStream.height !== 1080) {
    errors.push(`映像ストリーム仕様不一致: ${JSON.stringify(vStream || null)}`);
  }
  if (!aStream || aStream.codec_name !== 'aac' || Number(aStream.sample_rate) !== 48000 || Number(aStream.channels) !== 2) {
    errors.push(`音声ストリーム仕様不一致: ${JSON.stringify(aStream || null)}`);
  }

  if (timeline?.totalDuration && Math.abs(duration - Number(timeline.totalDuration)) > 0.5) {
    errors.push(`尺が timeline.json (${timeline.totalDuration}s) と乖離しています (MP4=${duration}s)`);
  }

  const vol = runVolumedetect(videoPath);
  if (vol.meanVolumeDb < -50) {
    errors.push(`音声が無音に近すぎます (mean_volume=${vol.meanVolumeDb} dB)`);
  }
  if (vol.maxVolumeDb > -0.1) {
    errors.push(`音割れの恐れがあります (max_volume=${vol.maxVolumeDb} dB)`);
  }

  const fpsParts = String(vStream?.r_frame_rate || '30/1').split('/').map(Number);
  const fps = fpsParts.length === 2 && fpsParts[1] > 0 ? fpsParts[0] / fpsParts[1] : 30;
  const { boundaries, cutinWindows } = buildCutinTransitionWindows(timeline);

  const flickerResults = [];
  for (const cropInfo of PORTRAIT_CROPS) {
    const res = await scanPortraitCrop(videoPath, cropInfo, fps, boundaries, cutinWindows);
    flickerResults.push(res);
    if (res.alphaDipFlickers.length > 0) {
      errors.push(
        `${cropInfo.name} に立ち絵チラつき候補を ${res.alphaDipFlickers.length} 件検出: ` +
        res.alphaDipFlickers.slice(0, 5).map((f) => `frame=${f.frame}(${f.time}s)`).join(', ')
      );
    }
  }

  info.push(`MP4: ${path.relative(rootDir, videoPath)} (${vStream?.width}x${vStream?.height}, ${vStream?.r_frame_rate}, ${duration.toFixed(2)}s)`);
  info.push(`音量: mean=${vol.meanVolumeDb} dB, max=${vol.maxVolumeDb} dB`);
  for (const fr of flickerResults) {
    info.push(`チラつき検査 (${fr.actor}): frames=${fr.frames}, alphaDipFlickers=${fr.alphaDipFlickers.length}, motionSpikes=${fr.motionSpikes.length}`);
  }

  let grid = null;
  if (gridPath) {
    grid = await generateVerificationGrid(videoPath, timeline, duration, gridPath);
    info.push(`最終確認グリッド生成: ${grid.path} (at ${grid.timestamps.join(',')}s)`);
  }

  return { errors, warnings, info, videoPath, probe: { duration, vStream, aStream }, vol, flickerResults, grid };
}

async function main() {
  const { episodeDir, stage, videoPath, gridPath, jsonOutput, browserSmoke } = parseArgs(process.argv.slice(2));
  const result = {
    ok: true,
    episodeDir: path.relative(rootDir, episodeDir),
    stage,
    pre: null,
    post: null,
  };

  if (stage === 'script') {
    result.pre = await runPreChecks(episodeDir, { scriptOnly: true, browserSmoke: false });
  } else if (stage === 'pre' || stage === 'all') {
    result.pre = await runPreChecks(episodeDir, { browserSmoke });
  }

  if (stage === 'post' || stage === 'all') {
    const resolvedVideo = await resolveTargetVideo(episodeDir, videoPath);
    if (resolvedVideo || stage === 'post') {
      result.post = await runPostChecks(episodeDir, videoPath, gridPath);
    }
  }

  const preErrors = result.pre?.errors || [];
  const postErrors = result.post?.errors || [];
  result.ok = preErrors.length === 0 && postErrors.length === 0;

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const preLabel = stage === 'script' ? 'SCRIPT' : 'PRE';
    console.log(`\n=== Episode Verification: ${result.episodeDir} (stage=${stage}) ===`);
    for (const [label, block] of [[preLabel, result.pre], ['POST', result.post]]) {
      if (!block) continue;
      console.log(`\n[${label}]`);
      for (const m of block.info) console.log(`  [INFO] ${m}`);
      for (const w of block.warnings) console.log(`  [WARN] ${w}`);
      for (const e of block.errors) console.error(`  [ERROR] ${e}`);
      if (label === 'PRE' && block.snapshotAt?.length) {
        console.log(`  [SNAPSHOT --at] ${block.snapshotAt.join(',')}`);
      }
    }
    console.log(`\nResult: ${result.ok ? 'PASS' : 'FAIL'}`);
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
