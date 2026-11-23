import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let episodeArg = null;
  let dryTimeline = false;
  for (const arg of argv) {
    if (arg === '--dry-timeline') {
      dryTimeline = true;
    } else if (!arg.startsWith('-') && !episodeArg) {
      episodeArg = arg;
    }
  }
  if (!episodeArg) {
    console.error('Usage: node tools/build-episode.mjs <episodeDir> [--dry-timeline]');
    process.exit(1);
  }
  return {
    episodeDir: path.isAbsolute(episodeArg) ? episodeArg : path.resolve(rootDir, episodeArg),
    dryTimeline,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractSceneParts(html) {
  const styles = [];
  const scripts = [];
  let body = html;

  body = body.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styles.push(css.trim());
    return '';
  });

  body = body.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => {
    scripts.push(js.trim());
    return '';
  });

  return {
    style: styles.join('\n\n'),
    script: scripts.join('\n\n'),
    html: body.trim(),
  };
}

function buildDryTimeline(script, characters, episodeDir) {
  let globalCursor = 0;
  const chapters = [];
  for (const chapter of script.chapters || []) {
    const chStart = Number(globalCursor.toFixed(4));
    let localCursor = 0.45;
    const cues = {};
    const lines = [];
    const rawLines = chapter.lines || [];

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const char = characters[line.speaker];
      if (!char) {
        throw new Error(`Unknown speaker "${line.speaker}" in chapter "${chapter.id}"`);
      }
      const charsPerSec = 6.2;
      const estDuration = Number(Math.max(2.0, (line.caption || '').length / charsPerSec).toFixed(4));
      const start = Number(localCursor.toFixed(4));
      const end = Number((start + estDuration).toFixed(4));
      if (line.cue) cues[line.cue] = start;

      const nextLine = rawLines[i + 1];
      let pauseAfter = 0;
      if (nextLine) {
        if (typeof line.pause_after === 'number') pauseAfter = line.pause_after;
        else if (nextLine.mode === 'cutin' || nextLine.speaker === 'tsumugi') pauseAfter = 0.45;
        else if (nextLine.speaker !== line.speaker) pauseAfter = 0.35;
        else pauseAfter = 0.22;
      }

      lines.push({
        index: i + 1,
        id: `${chapter.id}_${String(i + 1).padStart(3, '0')}`,
        speaker: line.speaker,
        speakerName: char.name,
        style: line.style || char.default_style || 'normal',
        mode: line.mode || (line.speaker === 'tsumugi' ? 'cutin' : 'normal'),
        emotion: line.emotion || char.default_emotion || 'normal',
        se: line.se || null,
        caption: line.caption,
        audioFile: null,
        start,
        end,
        globalStart: Number((chStart + start).toFixed(4)),
        globalEnd: Number((chStart + end).toFixed(4)),
        duration: estDuration,
        mouthSpans: null,
        pauseAfter,
        cue: line.cue || null,
      });

      localCursor = end + pauseAfter;
    }

    const chDuration = Number((localCursor + 0.75).toFixed(4));
    const chEnd = Number((chStart + chDuration).toFixed(4));
    globalCursor = chEnd;
    chapters.push({
      id: chapter.id,
      title: chapter.title,
      layout: chapter.layout || 'default',
      start: chStart,
      end: chEnd,
      duration: chDuration,
      cues,
      lines,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    meta: {
      title: script.meta?.title || path.basename(episodeDir),
      series: script.meta?.series || null,
      episode: script.meta?.episode || null,
      theme: script.meta?.theme || 'clean-light',
      accent_color: script.meta?.accent_color || null,
      bgm: script.meta?.bgm || null,
      fps: script.meta?.fps || 30,
      width: script.meta?.width || 1920,
      height: script.meta?.height || 1080,
    },
    totalDuration: Number(globalCursor.toFixed(4)),
    chapters,
  };
}

function replaceAllTokens(template, replacements) {
  let out = template;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildPortraitTags(speakerId, char, usedEmotions, distCharBaseDir) {
  const defaultEmotion = char.default_emotion || 'normal';
  const emotions = new Set([defaultEmotion, ...usedEmotions]);
  const srcBase = char.portraits_dir
    ? path.resolve(rootDir, char.portraits_dir)
    : path.join(rootDir, 'assets', 'characters', 'exported', speakerId);

  const destDir = path.join(distCharBaseDir, speakerId);
  await fs.mkdir(destDir, { recursive: true });

  const tags = [];
  for (const emotion of emotions) {
    for (const mouth of ['closed', 'open']) {
      const fileName = `${emotion}_${mouth}.png`;
      const srcPng = path.join(srcBase, fileName);
      if (!(await fileExists(srcPng))) {
        throw new Error(`立ち絵PNGが見つかりません: ${srcPng} (先に npm run portraits:export を実行してください)`);
      }
      await fs.copyFile(srcPng, path.join(destDir, fileName));
      const isInitial = emotion === defaultEmotion && mouth === 'closed';
      tags.push(
        `<img class="portrait-img${isInitial ? ' is-initial' : ''}" data-emotion="${escapeHtml(emotion)}" data-mouth="${mouth}" src="assets/characters/${escapeHtml(speakerId)}/${escapeHtml(fileName)}" alt="${escapeHtml(char.name)}" />`
      );
    }
  }
  return tags.join('');
}

function countStructuralLines(html) {
  return String(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')
    .split('\n').length;
}

async function main() {
  const { episodeDir, dryTimeline } = parseArgs(process.argv.slice(2));
  const scriptPath = path.join(episodeDir, 'script.yaml');
  const timelinePath = path.join(episodeDir, 'timeline.json');
  const charactersPath = path.join(rootDir, 'config', 'characters.yaml');

  const script = yaml.load(await fs.readFile(scriptPath, 'utf8'));
  const characters = yaml.load(await fs.readFile(charactersPath, 'utf8'));

  let timeline;
  if (dryTimeline) {
    timeline = buildDryTimeline(script, characters, episodeDir);
    console.log('[DRY TIMELINE] Using estimated durations (no audio tracks).');
  } else {
    try {
      timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));
    } catch {
      throw new Error(
        `timeline.json が見つかりません。先に "npm run episode:audio -- ${path.relative(rootDir, episodeDir)}" を実行してください。`
      );
    }
  }

  const themeName = timeline.meta?.theme || script.meta?.theme || 'clean-light';
  const themePath = path.join(rootDir, 'config', 'themes', `${themeName}.css`);
  const themeCss = await fs.readFile(themePath, 'utf8');

  const accentColor = timeline.meta?.accent_color || script.meta?.accent_color;
  const accentOverrideCss = accentColor
    ? `:root {\n  --accent-primary: ${accentColor};\n}\n`
    : '';

  const diagramKitCss = await fs.readFile(path.join(rootDir, 'templates', 'diagram-kit.css'), 'utf8');
  const svgIconsPath = path.join(rootDir, 'templates', 'svg-icons.svg');
  const svgIconsMarkup = (await fileExists(svgIconsPath))
    ? `${(await fs.readFile(svgIconsPath, 'utf8')).trim()}\n`
    : '';
  const shellTemplate = await fs.readFile(path.join(rootDir, 'templates', 'chapter-shell.html'), 'utf8');
  const runtimeSrcPath = path.join(rootDir, 'templates', 'stage-runtime.js');
  const widgetsSrcPath = path.join(rootDir, 'templates', 'diagram-widgets.js');
  const gsapSrcPath = path.join(rootDir, 'node_modules', 'gsap', 'dist', 'gsap.min.js');

  const distDir = path.join(episodeDir, 'dist');
  const compDir = path.join(distDir, 'compositions');
  const vendorDir = path.join(distDir, 'vendor');
  const distAudioDir = path.join(distDir, 'assets', 'audio');
  const distCharDir = path.join(distDir, 'assets', 'characters');
  const distBgmDir = path.join(distDir, 'assets', 'bgm');
  const distSeDir = path.join(distDir, 'assets', 'se');

  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(compDir, { recursive: true });
  await fs.mkdir(vendorDir, { recursive: true });
  await fs.mkdir(distAudioDir, { recursive: true });
  await fs.mkdir(distCharDir, { recursive: true });

  await fs.copyFile(gsapSrcPath, path.join(vendorDir, 'gsap.min.js'));
  await fs.copyFile(runtimeSrcPath, path.join(vendorDir, 'stage-runtime.js'));
  await fs.copyFile(widgetsSrcPath, path.join(vendorDir, 'diagram-widgets.js'));

  const width = timeline.meta?.width || 1920;
  const height = timeline.meta?.height || 1080;
  const fps = timeline.meta?.fps || 30;
  const episodeTitle = timeline.meta?.title || path.basename(episodeDir);
  const rawEpisode = timeline.meta?.episode;
  const episodeBadge =
    timeline.meta?.badge ||
    (rawEpisode && rawEpisode !== '解説動画' ? rawEpisode : null) ||
    timeline.meta?.series ||
    rawEpisode ||
    '解説動画';
  const totalDuration = Math.max(0.5, Number(timeline.totalDuration) || 1);

  const hostElements = [];
  const headScriptTags = [];
  let maxStructuralLines = 0;
  let maxStructuralChapter = '';

  for (let chIdx = 0; chIdx < timeline.chapters.length; chIdx++) {
    const chapter = timeline.chapters[chIdx];
    const scenePath = path.join(episodeDir, 'scenes', `${chapter.id}.html`);
    const sceneRaw = await fs.readFile(scenePath, 'utf8');
    const sceneParts = extractSceneParts(sceneRaw);

    const audioTags = [];
    const usedEmotions = {
      metan: new Set(),
      zundamon: new Set(),
      tsumugi: new Set(),
    };

    for (let i = 0; i < chapter.lines.length; i++) {
      const line = chapter.lines[i];
      const char = characters[line.speaker] || { color: '#2563eb', name: line.speakerName, default_emotion: 'normal' };

      if (usedEmotions[line.speaker] && line.emotion) {
        usedEmotions[line.speaker].add(line.emotion);
      }

      if (line.audioFile) {
        const srcAudioPath = path.join(episodeDir, line.audioFile);
        const audioFileName = path.basename(line.audioFile);
        const destAudioPath = path.join(distAudioDir, audioFileName);
        await fs.copyFile(srcAudioPath, destAudioPath);

        audioTags.push(
          `    <audio id="voice-${escapeHtml(line.id)}" class="clip" src="assets/audio/${escapeHtml(audioFileName)}" data-start="${line.start}" data-duration="${line.duration}" data-volume="1" data-track-index="1" data-hf-media-start-basis="local"></audio>`
        );
      }

      if (line.se && line.se.file && !dryTimeline) {
        const srcSePath = path.join(rootDir, 'assets', 'se', line.se.file);
        if (await fileExists(srcSePath)) {
          await fs.mkdir(distSeDir, { recursive: true });
          await fs.copyFile(srcSePath, path.join(distSeDir, line.se.file));
          const seStart = Number(Math.max(0, line.start + (line.se.offset || 0)).toFixed(4));
          const seVol = line.se.volume ?? 0.6;
          audioTags.push(
            `    <audio id="se-${escapeHtml(line.id)}" class="clip" src="assets/se/${escapeHtml(line.se.file)}" data-start="${seStart}" data-volume="${seVol}" data-track-index="2" data-hf-media-start-basis="local"></audio>`
          );
        } else {
          console.warn(`[WARN] SE file not found (skipped): assets/se/${line.se.file}`);
        }
      }
    }

    const metanPortraits = await buildPortraitTags('metan', characters.metan, usedEmotions.metan, distCharDir);
    const zundamonPortraits = await buildPortraitTags('zundamon', characters.zundamon, usedEmotions.zundamon, distCharDir);
    const tsumugiPortraits = await buildPortraitTags('tsumugi', characters.tsumugi, usedEmotions.tsumugi, distCharDir);

    const chapterRuntimeData = {
      id: chapter.id,
      title: chapter.title,
      layout: chapter.layout || 'default',
      fps,
      duration: chapter.duration,
      progressStartRatio: Number((chapter.start / totalDuration).toFixed(4)),
      progressEndRatio: Number((chapter.end / totalDuration).toFixed(4)),
      cues: chapter.cues || {},
      lines: chapter.lines.map((l) => {
        const lineChar = characters[l.speaker] || { color: '#2563eb', name: l.speakerName, default_emotion: 'normal' };
        return {
          index: l.index,
          id: l.id,
          speaker: l.speaker,
          speakerName: lineChar.name || l.speakerName,
          speakerColor: lineChar.color || '#2563eb',
          style: l.style,
          mode: l.mode,
          emotion: l.emotion || lineChar.default_emotion || 'normal',
          caption: l.caption,
          start: l.start,
          end: l.end,
          duration: l.duration,
          mouthSpans: l.mouthSpans || null,
          cue: l.cue,
        };
      }),
    };

    let diagramScriptTag = '';
    if (sceneParts.script && sceneParts.script.trim()) {
      const diagramJsName = `diagram-${chapter.id}.js`;
      const trimmedScript = sceneParts.script.trim();
      const guardedScript = /window\.__diagramBuilders\s*=/.test(trimmedScript)
        ? trimmedScript
        : `window.__diagramBuilders = window.__diagramBuilders || {};\n${trimmedScript}`;
      await fs.writeFile(path.join(vendorDir, diagramJsName), `${guardedScript}\n`, 'utf8');
      diagramScriptTag = `  <script src="vendor/${escapeHtml(diagramJsName)}"></script>`;
      headScriptTags.push(diagramScriptTag);
    }

    const chapterHtml = replaceAllTokens(shellTemplate, {
      '{{COMPOSITION_ID}}': escapeHtml(chapter.id),
      '{{COMPOSITION_ID_JSON}}': JSON.stringify(chapter.id),
      '{{CHAPTER_DATA_JSON}}': JSON.stringify(chapterRuntimeData),
      '{{THEME_CSS}}': themeCss,
      '{{ACCENT_OVERRIDE_CSS}}': accentOverrideCss,
      '{{DIAGRAM_KIT_CSS}}': diagramKitCss,
      '{{DIAGRAM_STYLE}}': sceneParts.style,
      '{{CHAPTER_LAYOUT}}': escapeHtml(chapter.layout || 'default'),
      '{{CHAPTER_DURATION}}': String(chapter.duration),
      '{{WIDTH}}': String(width),
      '{{HEIGHT}}': String(height),
      '{{AUDIO_TRACKS}}': audioTags.join('\n'),
      '{{EPISODE_BADGE}}': escapeHtml(episodeBadge),
      '{{EPISODE_TITLE}}': escapeHtml(episodeTitle),
      '{{CHAPTER_TITLE}}': escapeHtml(chapter.title),
      '{{DIAGRAM_HTML}}': sceneParts.html,
      '{{CAPTION_ITEMS}}': '',
      '{{METAN_PORTRAITS}}': metanPortraits,
      '{{ZUNDAMON_PORTRAITS}}': zundamonPortraits,
      '{{TSUMUGI_PORTRAITS}}': tsumugiPortraits,
      '{{DIAGRAM_SCRIPT_TAG}}': diagramScriptTag,
    });

    const structuralLines = countStructuralLines(chapterHtml);
    if (structuralLines > maxStructuralLines) {
      maxStructuralLines = structuralLines;
      maxStructuralChapter = chapter.id;
    }

    await fs.writeFile(path.join(compDir, `${chapter.id}.html`), chapterHtml, 'utf8');

    hostElements.push(
      `    <div id="${escapeHtml(chapter.id)}"
         class="clip comp-layer"
         data-composition-id="${escapeHtml(chapter.id)}"
         data-composition-src="compositions/${escapeHtml(chapter.id)}.html"
         data-track-kind="graphics"
         data-start="${chapter.start}"
         data-duration="${chapter.duration}"
         data-width="${width}"
         data-height="${height}"
         data-track-index="0"></div>`
    );
  }

  let bgmTag = '';
  const bgm = timeline.meta?.bgm;
  if (bgm && bgm.file && !dryTimeline) {
    const srcBgmPath = path.join(rootDir, 'assets', 'bgm', bgm.file);
    if (await fileExists(srcBgmPath)) {
      await fs.mkdir(distBgmDir, { recursive: true });
      await fs.copyFile(srcBgmPath, path.join(distBgmDir, bgm.file));
      bgmTag = `\n    <audio id="bgm-main" class="clip" src="assets/bgm/${escapeHtml(bgm.file)}" data-start="0" data-duration="${totalDuration}" data-volume="${bgm.volume ?? 0.14}" data-fade-in="${bgm.fade_in ?? 1.0}" data-fade-out="${bgm.fade_out ?? 2.0}" data-track-index="3" loop></audio>`;
    } else {
      console.warn(`[WARN] BGM file not found (skipped): assets/bgm/${bgm.file}`);
    }
  }

  const bgMatch = themeCss.match(/--bg-canvas\s*:\s*([^;]+);/);
  const rootBgColor = bgMatch ? bgMatch[1].trim() : (themeName === 'tech-dark' ? '#0b1120' : '#f8fafc');

  const indexHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <title>${escapeHtml(episodeTitle)}</title>
  <script src="vendor/gsap.min.js"></script>
  <script src="vendor/stage-runtime.js"></script>
  <script src="vendor/diagram-widgets.js"></script>
${headScriptTags.join('\n')}
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${rootBgColor};
      font-family: "Noto Sans JP", sans-serif;
    }
    #root {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
    }
    .comp-layer {
      position: absolute;
      inset: 0;
    }
    .dg-svg-sprite {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
      pointer-events: none;
    }
  </style>
</head>
<body>
${svgIconsMarkup}  <div id="root"
       data-composition-id="main"
       data-start="0"
       data-duration="${totalDuration}"
       data-fps="${fps}"
       data-width="${width}"
       data-height="${height}">
${hostElements.join('\n')}${bgmTag}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = gsap.timeline({ paused: true });
  </script>
</body>
</html>
`;

  await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8');

  console.log(`Built HyperFrames project: ${path.relative(rootDir, distDir)}`);
  console.log(`  Chapters: ${timeline.chapters.length} (${totalDuration.toFixed(2)}s total)`);
  if (maxStructuralChapter) {
    console.log(`  Max structural lines: ${maxStructuralLines} / 300 (${maxStructuralChapter})`);
  }
}

main().catch((err) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
