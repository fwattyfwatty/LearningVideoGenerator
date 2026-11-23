import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { applyDictionary, loadMergedDictionary } from './lib/text-reading.mjs';
import { ensureVoicevoxReady } from './lib/voicevox-launcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const voicevoxUrl = (process.env.VOICEVOX_URL || 'http://127.0.0.1:50021').replace(/\/$/, '');

const CHAPTER_HEAD_PADDING = 0.45;
const CHAPTER_TAIL_PADDING = 0.75;
const PAUSE_SAME_SPEAKER = 0.22;
const PAUSE_SPEAKER_CHANGE = 0.35;
const PAUSE_BEFORE_CUTIN = 0.45;

const MOUTH_WINDOW_SEC = 0.06;
const MOUTH_RMS_THRESHOLD = 0.018;
const MOUTH_MERGE_GAP_SEC = 0.11;
const MOUTH_MIN_SPAN_SEC = 0.09;

function resolveEpisodeDir(arg) {
  if (!arg) {
    console.error('Usage: node tools/build-audio.mjs <episodeDir>');
    process.exit(1);
  }
  return path.isAbsolute(arg) ? arg : path.resolve(rootDir, arg);
}

function parseWavInfo(buffer) {
  if (buffer.length < 12) {
    throw new Error('Invalid WAV: buffer too short');
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV: missing RIFF/WAVE header');
  }

  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 24000;
  let byteRate = 0;
  let bitsPerSample = 16;
  let dataOffset = 0;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const bodyOffset = offset + 8;

    if (chunkId === 'fmt ') {
      if (bodyOffset + 16 <= buffer.length) {
        audioFormat = buffer.readUInt16LE(bodyOffset);
        numChannels = buffer.readUInt16LE(bodyOffset + 2);
        sampleRate = buffer.readUInt32LE(bodyOffset + 4);
        byteRate = buffer.readUInt32LE(bodyOffset + 8);
        bitsPerSample = buffer.readUInt16LE(bodyOffset + 14);
      }
    } else if (chunkId === 'data') {
      dataOffset = bodyOffset;
      dataSize = Math.min(chunkSize, buffer.length - bodyOffset);
    }

    if (byteRate > 0 && dataSize > 0) {
      break;
    }
    offset = bodyOffset + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) {
    throw new Error(`Invalid WAV: missing fmt/data chunk (byteRate=${byteRate}, dataSize=${dataSize})`);
  }

  return {
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    bitsPerSample,
    dataOffset,
    dataSize,
    durationSec: Number((dataSize / byteRate).toFixed(4)),
  };
}

function extractMouthSpans(buffer, wavInfo, lineStartSec, lineEndSec) {
  if (wavInfo.audioFormat !== 1 || wavInfo.bitsPerSample !== 16) {
    return [{ start: lineStartSec, end: lineEndSec }];
  }

  const bytesPerSample = wavInfo.bitsPerSample / 8;
  const frameBytes = bytesPerSample * wavInfo.numChannels;
  const totalFrames = Math.floor(wavInfo.dataSize / frameBytes);
  const winFrames = Math.max(1, Math.round(wavInfo.sampleRate * MOUTH_WINDOW_SEC));

  const rawSpans = [];
  let inSpan = false;
  let spanStartRel = 0;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx += winFrames) {
    const endFrame = Math.min(totalFrames, frameIdx + winFrames);
    const count = endFrame - frameIdx;
    if (count <= 0) break;

    let sumSq = 0;
    for (let f = frameIdx; f < endFrame; f++) {
      const bytePos = wavInfo.dataOffset + f * frameBytes;
      let sampleSum = 0;
      for (let ch = 0; ch < wavInfo.numChannels; ch++) {
        sampleSum += buffer.readInt16LE(bytePos + ch * bytesPerSample) / 32768;
      }
      const mono = sampleSum / wavInfo.numChannels;
      sumSq += mono * mono;
    }

    const rms = Math.sqrt(sumSq / count);
    const tStart = frameIdx / wavInfo.sampleRate;
    const tEnd = endFrame / wavInfo.sampleRate;

    if (rms >= MOUTH_RMS_THRESHOLD) {
      if (!inSpan) {
        inSpan = true;
        spanStartRel = tStart;
      }
    } else if (inSpan) {
      rawSpans.push({ start: spanStartRel, end: tStart });
      inSpan = false;
    }
  }

  if (inSpan) {
    rawSpans.push({ start: spanStartRel, end: totalFrames / wavInfo.sampleRate });
  }

  // Merge tiny gaps and filter micro noise
  const merged = [];
  for (const sp of rawSpans) {
    if (merged.length > 0 && sp.start - merged[merged.length - 1].end < MOUTH_MERGE_GAP_SEC) {
      merged[merged.length - 1].end = sp.end;
    } else {
      merged.push({ ...sp });
    }
  }

  return merged
    .filter((sp) => sp.end - sp.start >= MOUTH_MIN_SPAN_SEC)
    .map((sp) => ({
      start: Number(Math.min(lineEndSec, lineStartSec + sp.start).toFixed(4)),
      end: Number(Math.min(lineEndSec, lineStartSec + sp.end).toFixed(4)),
    }))
    .filter((sp) => sp.end > sp.start);
}

function resolveEmotion(line, char) {
  let emotion = line.emotion;
  if (!emotion) {
    if (line.style === 'herohero' || line.style === 'namidame') {
      emotion = 'worry';
    } else if (line.style === 'tsundere') {
      emotion = 'serious';
    } else {
      emotion = char.default_emotion || 'normal';
    }
  }
  if (Array.isArray(char.emotions) && !char.emotions.includes(emotion)) {
    throw new Error(
      `Unknown emotion "${emotion}" for speaker "${line.speaker}". Available: ${char.emotions.join(', ')}`
    );
  }
  return emotion;
}

function normalizeSe(se) {
  if (!se) return null;
  if (typeof se === 'string') {
    return { file: se, volume: 0.6, offset: 0 };
  }
  if (typeof se === 'object' && se.file) {
    return {
      file: String(se.file),
      volume: typeof se.volume === 'number' ? se.volume : 0.6,
      offset: typeof se.offset === 'number' ? se.offset : 0,
    };
  }
  return null;
}

function normalizeBgm(bgm) {
  if (!bgm) return null;
  if (typeof bgm === 'string') {
    return { file: bgm, volume: 0.14, fade_in: 1.0, fade_out: 2.0 };
  }
  if (typeof bgm === 'object' && bgm.file) {
    return {
      file: String(bgm.file),
      volume: typeof bgm.volume === 'number' ? bgm.volume : 0.14,
      fade_in: typeof bgm.fade_in === 'number' ? bgm.fade_in : 1.0,
      fade_out: typeof bgm.fade_out === 'number' ? bgm.fade_out : 2.0,
    };
  }
  return null;
}

async function synthesizeVoice({ text, speakerId, speedScale, pitchScale, intonationScale }) {
  const queryUrl = `${voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
  const queryRes = await fetch(queryUrl, { method: 'POST' });
  if (!queryRes.ok) {
    throw new Error(`audio_query failed: HTTP ${queryRes.status} ${await queryRes.text()}`);
  }
  const audioQuery = await queryRes.json();
  audioQuery.speedScale = speedScale;
  audioQuery.pitchScale = pitchScale;
  audioQuery.intonationScale = intonationScale;

  const synthUrl = `${voicevoxUrl}/synthesis?speaker=${speakerId}`;
  const synthRes = await fetch(synthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(audioQuery),
  });
  if (!synthRes.ok) {
    throw new Error(`synthesis failed: HTTP ${synthRes.status} ${await synthRes.text()}`);
  }

  return Buffer.from(await synthRes.arrayBuffer());
}

async function ensureVoicevoxReachable(
  autoStart = !process.argv.slice(2).includes('--no-auto-start') && process.env.VOICEVOX_AUTO_START !== '0'
) {
  await ensureVoicevoxReady({ voicevoxUrl, autoStart });
}

async function main() {
  const episodeArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const episodeDir = resolveEpisodeDir(episodeArg);
  const scriptPath = path.join(episodeDir, 'script.yaml');
  const charactersPath = path.join(rootDir, 'config', 'characters.yaml');

  const script = yaml.load(await fs.readFile(scriptPath, 'utf8'));
  const characters = yaml.load(await fs.readFile(charactersPath, 'utf8'));
  const dictionary = await loadMergedDictionary(rootDir, episodeDir);

  const cacheDir = path.join(episodeDir, 'audio', 'cache');
  const linesDir = path.join(episodeDir, 'audio', 'lines');
  const outputDir = path.join(episodeDir, 'output');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.rm(linesDir, { recursive: true, force: true });
  await fs.mkdir(linesDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  let cacheHits = 0;
  let generated = 0;
  let voicevoxChecked = false;
  const usedSpeakers = new Set();
  const usedSoundEffects = new Set();

  const bgmConfig = normalizeBgm(script.meta?.bgm);
  let globalCursor = 0;
  const timelineChapters = [];

  for (const chapter of script.chapters || []) {
    const chapterStartGlobal = Number(globalCursor.toFixed(4));
    let localCursor = CHAPTER_HEAD_PADDING;
    const timelineLines = [];
    const cues = {};
    const rawLines = chapter.lines || [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const char = characters[line.speaker];
      if (!char) {
        throw new Error(`Unknown speaker "${line.speaker}" in chapter "${chapter.id}" line ${i + 1}`);
      }
      usedSpeakers.add(line.speaker);

      const styleKey = line.style || char.default_style || 'normal';
      const speakerId =
        typeof styleKey === 'number' ? styleKey : char.styles?.[styleKey];
      if (speakerId === undefined) {
        throw new Error(
          `Unknown style "${styleKey}" for speaker "${line.speaker}" in chapter "${chapter.id}"`
        );
      }

      const emotion = resolveEmotion(line, char);
      const se = normalizeSe(line.se);
      if (se) usedSoundEffects.add(se.file);

      const voiceText = (line.voice_text || applyDictionary(line.caption || '', dictionary)).trim();
      if (!voiceText) {
        throw new Error(`Empty voice text in chapter "${chapter.id}" line ${i + 1}`);
      }

      const speedScale = line.speedScale ?? char.speedScale ?? 1.0;
      const pitchScale = line.pitchScale ?? char.pitchScale ?? 0.0;
      const intonationScale = line.intonationScale ?? char.intonationScale ?? 1.0;

      const hashPayload = JSON.stringify({
        speakerId,
        voiceText,
        speedScale,
        pitchScale,
        intonationScale,
      });
      const hash = crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 16);
      const cacheWavPath = path.join(cacheDir, `${hash}.wav`);

      let wavBuffer;
      try {
        wavBuffer = await fs.readFile(cacheWavPath);
        cacheHits += 1;
      } catch {
        if (!voicevoxChecked) {
          await ensureVoicevoxReachable();
          voicevoxChecked = true;
        }
        wavBuffer = await synthesizeVoice({
          text: voiceText,
          speakerId,
          speedScale,
          pitchScale,
          intonationScale,
        });
        await fs.writeFile(cacheWavPath, wavBuffer);
        generated += 1;
      }

      const wavInfo = parseWavInfo(wavBuffer);
      const duration = wavInfo.durationSec;
      const paddedIdx = String(i + 1).padStart(3, '0');
      const lineFileName = `${chapter.id}_${paddedIdx}.wav`;
      const lineWavPath = path.join(linesDir, lineFileName);
      await fs.writeFile(lineWavPath, wavBuffer);

      const start = Number(localCursor.toFixed(4));
      const end = Number((start + duration).toFixed(4));
      const globalStart = Number((chapterStartGlobal + start).toFixed(4));
      const globalEnd = Number((chapterStartGlobal + end).toFixed(4));
      const mouthSpans = extractMouthSpans(wavBuffer, wavInfo, start, end);

      if (line.cue) {
        cues[line.cue] = start;
      }

      const nextLine = rawLines[i + 1];
      let pauseAfter = 0;
      if (nextLine) {
        if (typeof line.pause_after === 'number') {
          pauseAfter = line.pause_after;
        } else if (nextLine.mode === 'cutin' || nextLine.speaker === 'tsumugi') {
          pauseAfter = PAUSE_BEFORE_CUTIN;
        } else if (nextLine.speaker !== line.speaker) {
          pauseAfter = PAUSE_SPEAKER_CHANGE;
        } else {
          pauseAfter = PAUSE_SAME_SPEAKER;
        }
      }

      timelineLines.push({
        index: i + 1,
        id: `${chapter.id}_${paddedIdx}`,
        speaker: line.speaker,
        speakerName: char.name,
        style: styleKey,
        speakerId,
        mode: line.mode || (line.speaker === 'tsumugi' ? 'cutin' : 'normal'),
        emotion,
        se,
        caption: line.caption,
        voiceText,
        audioFile: `audio/lines/${lineFileName}`,
        hash,
        start,
        end,
        globalStart,
        globalEnd,
        duration,
        mouthSpans,
        pauseAfter,
        cue: line.cue || null,
      });

      localCursor = end + pauseAfter;
    }

    const chapterDuration = Number((localCursor + CHAPTER_TAIL_PADDING).toFixed(4));
    const chapterEndGlobal = Number((chapterStartGlobal + chapterDuration).toFixed(4));
    globalCursor = chapterEndGlobal;

    timelineChapters.push({
      id: chapter.id,
      title: chapter.title,
      layout: chapter.layout || 'default',
      start: chapterStartGlobal,
      end: chapterEndGlobal,
      duration: chapterDuration,
      cues,
      lines: timelineLines,
    });
  }

  const timeline = {
    generatedAt: new Date().toISOString(),
    meta: {
      title: script.meta?.title || path.basename(episodeDir),
      series: script.meta?.series || null,
      episode: script.meta?.episode || null,
      theme: script.meta?.theme || 'clean-light',
      accent_color: script.meta?.accent_color || null,
      bgm: bgmConfig,
      fps: script.meta?.fps || 30,
      width: script.meta?.width || 1920,
      height: script.meta?.height || 1080,
    },
    totalDuration: Number(globalCursor.toFixed(4)),
    chapters: timelineChapters,
  };

  const timelinePath = path.join(episodeDir, 'timeline.json');
  await fs.writeFile(timelinePath, JSON.stringify(timeline, null, 2), 'utf8');

  const speakerList = Array.from(usedSpeakers);
  const creditSections = [
    '[音声クレジット]',
    ...speakerList.map((s) => characters[s].credit),
  ];

  const portraitCredits = Array.from(
    new Set(speakerList.map((s) => characters[s].portrait_credit).filter(Boolean))
  );
  if (portraitCredits.length > 0) {
    creditSections.push('', '[立ち絵クレジット]', ...portraitCredits);
  }

  const mediaNotes = [];
  if (bgmConfig?.file) mediaNotes.push(`BGM: ${bgmConfig.file}`);
  for (const seFile of usedSoundEffects) {
    mediaNotes.push(`SE: ${seFile}`);
  }
  if (mediaNotes.length > 0) {
    creditSections.push('', '[使用音源メモ]', ...mediaNotes);
  }

  const creditsPath = path.join(outputDir, 'credits.txt');
  await fs.writeFile(creditsPath, `${creditSections.join('\n')}\n`, 'utf8');

  console.log(`Audio & timeline built for: ${path.relative(rootDir, episodeDir)}`);
  console.log(`  Generated (VOICEVOX): ${generated}`);
  console.log(`  Cache hits:           ${cacheHits}`);
  console.log(`  Total duration:       ${timeline.totalDuration.toFixed(2)}s (${timelineChapters.length} chapters)`);
  console.log(`  Timeline:             ${path.relative(rootDir, timelinePath)}`);
  console.log(`  Credits:              ${path.relative(rootDir, creditsPath)}`);
}

main().catch((err) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
