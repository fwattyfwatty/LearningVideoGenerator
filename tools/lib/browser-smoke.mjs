import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findChromeInDir(dir, depth = 0) {
  if (depth > 5 || !(await exists(dir))) return [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findChromeInDir(full, depth + 1)));
    } else if (/^chrome(-headless-shell)?(\.exe)?$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function resolveChromeExecutable() {
  for (const envKey of ['HYPERFRAMES_BROWSER_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    const candidate = process.env[envKey];
    if (candidate && (await exists(candidate))) {
      return candidate;
    }
  }

  const home = os.homedir();
  const cacheCandidates = [
    ...(await findChromeInDir(path.join(home, '.cache', 'hyperframes', 'chrome'))),
    ...(await findChromeInDir(path.join(home, '.cache', 'puppeteer'))),
  ];
  if (cacheCandidates.length > 0) {
    cacheCandidates.sort((a, b) => b.localeCompare(a));
    return cacheCandidates[0];
  }

  const systemCandidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  for (const candidate of systemCandidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractSvgSprite(indexHtml) {
  const m = String(indexHtml || '').match(/<svg\b[^>]*class="[^"]*dg-svg-sprite[^"]*"[^>]*>[\s\S]*?<\/svg>/i);
  return m ? m[0] : '';
}

function unwrapTemplateHtml(compHtml) {
  return String(compHtml || '')
    .replace(/^\s*<template\b[^>]*>/i, '')
    .replace(/<\/template>\s*$/i, '')
    .trim();
}

function startDistServer(distDir) {
  let cachedSprite = '';
  const server = http.createServer(async (req, res) => {
    try {
      const rawUrl = (req.url || '/').split('?')[0];
      const relPath = decodeURIComponent(rawUrl);

      if (relPath.startsWith('/__smoke/') && relPath.endsWith('.html')) {
        const chId = relPath.slice('/__smoke/'.length, -'.html'.length);
        if (!/^[A-Za-z0-9_-]+$/.test(chId)) {
          res.writeHead(400).end('Invalid chapter id');
          return;
        }
        if (!cachedSprite) {
          try {
            const idx = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
            cachedSprite = extractSvgSprite(idx);
          } catch {
            cachedSprite = '';
          }
        }
        const compPath = path.join(distDir, 'compositions', `${chId}.html`);
        const compRaw = await fs.readFile(compPath, 'utf8');
        const innerHtml = unwrapTemplateHtml(compRaw);
        const doc = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <base href="/" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: "Noto Sans JP", sans-serif; }
    #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
    .dg-svg-sprite { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
  </style>
</head>
<body>
${cachedSprite}
${innerHtml}
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(doc);
        return;
      }

      const normalized = path.normalize(relPath.replace(/^\/+/, ''));
      const fullPath = path.resolve(distDir, normalized || 'index.html');
      if (!fullPath.startsWith(path.resolve(distDir))) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const data = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

function buildChapterCheckPoints(chapter, chapterSpec) {
  const dur = Math.max(1, Number(chapter?.duration) || 10);
  const cues = chapter?.cues || {};
  const cueVals = Object.values(cues).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const firstCue = cueVals.length > 0 ? Math.min(...cueVals) : 0.45;
  const rawPoints = [];

  const pushPoint = (kind, rawT) => {
    const t = Number(Math.min(Math.max(0.25, rawT), Math.max(0.3, dur - 0.35)).toFixed(2));
    const existing = rawPoints.find((p) => Math.abs(p.t - t) < 0.2);
    if (existing) {
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    } else {
      rawPoints.push({ t, kinds: [kind] });
    }
  };

  pushPoint('early', Math.max(1.8, firstCue + 1.2));

  const transitions = Array.isArray(chapterSpec?.phase_transitions) ? chapterSpec.phase_transitions : [];
  for (const tr of transitions) {
    const tSwitch = cues[tr.at_cue];
    if (typeof tSwitch === 'number' && Number.isFinite(tSwitch)) {
      pushPoint('phaseA_peak', Math.max(0.5, tSwitch - 1.5));
      pushPoint('post_switch', Math.min(dur - 0.4, tSwitch + 0.45));
    }
  }

  const lines = Array.isArray(chapter?.lines) ? chapter.lines : [];
  for (const line of lines) {
    if (line.speaker === 'tsumugi' || line.mode === 'cutin') {
      const lineDur = Math.max(0.5, Number(line.duration) || 2);
      const tMid = Number(line.start || 0) + Math.min(1.5, lineDur * 0.5);
      pushPoint('tsumugi', tMid);
    }
  }

  pushPoint('peak', Math.max(0.5, dur - 2.5));
  rawPoints.sort((a, b) => a.t - b.t);
  return rawPoints;
}

export async function runBrowserSmokeCheck(episodeDir, timeline, sceneSpecs = null) {
  const errors = [];
  const warnings = [];
  const info = [];

  const distDir = path.join(episodeDir, 'dist');
  const chromePath = await resolveChromeExecutable();
  if (!chromePath) {
    warnings.push('Chrome 実行ファイルが見つからないためブラウザ実行スモーク検査をスキップしました');
    return { errors, warnings, info };
  }

  const chapters = Array.isArray(timeline?.chapters) ? timeline.chapters : [];
  if (chapters.length === 0) {
    return { errors, warnings, info };
  }

  const specById = new Map();
  for (const sp of Array.isArray(sceneSpecs?.chapters) ? sceneSpecs.chapters : []) {
    if (sp?.id) specById.set(sp.id, sp);
  }

  let serverObj = null;
  let browser = null;
  let totalChecks = 0;
  let totalJsErrors = 0;

  try {
    serverObj = await startDistServer(distDir);
    const isShell = path.basename(chromePath).toLowerCase().includes('headless-shell');
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: isShell ? 'shell' : true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    let activeChapterId = '';
    const chapterRuntimeErrors = new Map();
    const recordErr = (msg) => {
      if (!activeChapterId) return;
      totalJsErrors++;
      if (!chapterRuntimeErrors.has(activeChapterId)) {
        chapterRuntimeErrors.set(activeChapterId, []);
      }
      chapterRuntimeErrors.get(activeChapterId).push(msg);
    };

    page.on('pageerror', (err) => {
      recordErr(err?.message || String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        recordErr(msg.text());
      }
    });

    for (const ch of chapters) {
      activeChapterId = ch.id;
      const url = `http://127.0.0.1:${serverObj.port}/__smoke/${encodeURIComponent(ch.id)}.html`;
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const jsErrs = chapterRuntimeErrors.get(ch.id) || [];
      if (jsErrs.length > 0) {
        errors.push(`${ch.id}: ブラウザ実行エラー (${jsErrs[0]})`);
      }

      const initState = await page.evaluate((compId) => {
        const tl = window.__timelines && window.__timelines[compId];
        const captionCount = document.querySelectorAll('.caption-item').length;
        return {
          hasTimeline: Boolean(tl && typeof tl.pause === 'function'),
          duration: tl && typeof tl.duration === 'function' ? tl.duration() : 0,
          captionCount,
        };
      }, ch.id);

      if (!initState.hasTimeline || initState.duration <= 0) {
        errors.push(`${ch.id}: ブラウザ上でタイムラインが初期化されませんでした (duration=${initState.duration})`);
        continue;
      }

      const expectedCaptions = Array.isArray(ch.lines) ? ch.lines.length : 0;
      if (initState.captionCount !== expectedCaptions) {
        errors.push(`${ch.id}: 字幕DOM数が台本と一致しません (DOM=${initState.captionCount}, expected=${expectedCaptions})`);
      }

      const points = buildChapterCheckPoints(ch, specById.get(ch.id));
      const reportedIssues = new Set();

      for (const pt of points) {
        totalChecks++;
        const diag = await page.evaluate(async ({ compId, seekTime, kinds }) => {
          const tl = window.__timelines && window.__timelines[compId];
          if (tl) {
            tl.pause(seekTime, false);
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

          const getEffectiveOpacity = (el) => {
            let op = 1;
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const cs = getComputedStyle(cur);
              if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
              op *= parseFloat(cs.opacity || '1');
              if (op <= 0.01) return 0;
              if (cur === document.body) break;
              cur = cur.parentElement;
            }
            return op;
          };

          const hasVisualPaint = (el, cs) => {
            const bg = cs.backgroundColor || '';
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return true;
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
            const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth]
              .map((w) => parseFloat(w) || 0);
            const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
            for (let i = 0; i < 4; i++) {
              if (bw[i] > 0 && bc[i] !== 'rgba(0, 0, 0, 0)' && bc[i] !== 'transparent') return true;
            }
            const tag = el.tagName.toLowerCase();
            return tag === 'svg' || tag === 'canvas' || tag === 'img';
          };

          const stage = document.querySelector('.diagram-stage');
          const out = {
            blankStage: false,
            emptySvgStages: 0,
            captionCollisions: [],
            portraitOverlaps: [],
            cutinOverlaps: [],
            orphanTexts: [],
          };
          if (!stage) return out;

          if (kinds.includes('post_switch') || kinds.includes('peak')) {
            const visNodes = stage.querySelectorAll('h1,h2,h3,h4,p,span,strong,svg,canvas,img,article,.dg-card,.dg-card-glow,.dg-callout,.dg-node,.dg-math-box,.dg-bar-fill');
            let visibleCount = 0;
            for (const el of visNodes) {
              if (getEffectiveOpacity(el) < 0.2) continue;
              const r = el.getBoundingClientRect();
              if (r.width > 4 && r.height > 4) {
                visibleCount++;
                break;
              }
            }
            if (visibleCount === 0) out.blankStage = true;
          }

          if (kinds.includes('peak')) {
            for (const box of stage.querySelectorAll('.dg-svg-stage')) {
              if (getEffectiveOpacity(box) < 0.5) continue;
              const r = box.getBoundingClientRect();
              if (r.width <= 40 || r.height <= 40) continue;
              if (box.children.length === 0 && !(box.textContent || '').trim()) {
                out.emptySvgStages++;
              }
            }
          }

          const boxes = stage.querySelectorAll('article, .dg-card, .dg-card-glow, .dg-callout, .dg-svg-stage, .dg-node, .dg-math-box, [class*="goal"], [class*="next"]');
          for (const el of boxes) {
            if (getEffectiveOpacity(el) < 0.35) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) continue;
            const cs = getComputedStyle(el);
            if (!hasVisualPaint(el, cs)) continue;

            const label = el.id || el.className?.toString().split(/\s+/).slice(0, 2).join('.') || el.tagName.toLowerCase();
            if (r.right > 298 && r.left < 1622 && r.bottom > 894) {
              out.captionCollisions.push(`${label}(y=${Math.round(r.bottom)})`);
            } else if ((r.left < 284 || r.right > 1652) && r.bottom > 824) {
              out.portraitOverlaps.push(`${label}(y=${Math.round(r.bottom)})`);
            }
          }

          const cutin = document.querySelector('.tsumugi-cutin');
          if (cutin && getEffectiveOpacity(cutin) >= 0.5) {
            const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              if (!node.nodeValue || !node.nodeValue.trim()) continue;
              const parent = node.parentElement;
              if (!parent || getEffectiveOpacity(parent) < 0.35) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const rects = range.getClientRects();
              for (const r of rects) {
                if (r.width < 2 || r.height < 2) continue;
                const ox = Math.min(r.right, 1884) - Math.max(r.left, 1576);
                const oy = Math.min(r.bottom, 250) - Math.max(r.top, 94);
                if (ox > 6 && oy > 6) {
                  out.cutinOverlaps.push(node.nodeValue.trim().slice(0, 20));
                  break;
                }
              }
            }
          }

          if (kinds.includes('peak') || kinds.includes('phaseA_peak')) {
            for (const el of stage.querySelectorAll('p, .dg-callout')) {
              if (el.closest('svg')) continue;
              if (getEffectiveOpacity(el) < 0.5) continue;
              const text = (el.innerText || el.textContent || '').trim();
              if (text.length < 18) continue;

              const lineMap = new Map();
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let tn;
              while ((tn = walker.nextNode())) {
                const val = tn.nodeValue || '';
                for (let idx = 0; idx < val.length; idx++) {
                  if (/\s/.test(val[idx])) continue;
                  const range = document.createRange();
                  range.setStart(tn, idx);
                  range.setEnd(tn, idx + 1);
                  const rect = range.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) continue;
                  const bucket = Math.round(rect.top / 6);
                  lineMap.set(bucket, (lineMap.get(bucket) || 0) + 1);
                }
              }
              if (lineMap.size >= 2) {
                const sorted = Array.from(lineMap.entries()).sort((a, b) => a[0] - b[0]);
                const lastCount = sorted[sorted.length - 1][1];
                if (lastCount >= 1 && lastCount <= 3) {
                  out.orphanTexts.push(`${text.slice(0, 18)}…(最終行${lastCount}文字)`);
                }
              }
            }
          }

          return out;
        }, { compId: ch.id, seekTime: pt.t, kinds: pt.kinds });

        if (diag.blankStage) {
          const key = `blank:${pt.kinds.join(',')}`;
          if (!reportedIssues.has(key)) {
            reportedIssues.add(key);
            errors.push(`${ch.id} @ ${pt.t}s (${pt.kinds.join(',')}): ステージ内に表示要素がありません（空白画面の恐れ）`);
          }
        }
        if (diag.emptySvgStages > 0 && !reportedIssues.has('emptySvg')) {
          reportedIssues.add('emptySvg');
          warnings.push(`${ch.id} @ ${pt.t}s: 空の .dg-svg-stage が ${diag.emptySvgStages} 件あります`);
        }
        for (const item of diag.captionCollisions) {
          const key = `cap:${item}`;
          if (!reportedIssues.has(key)) {
            reportedIssues.add(key);
            errors.push(`${ch.id} @ ${pt.t}s: 図解要素が字幕ドック領域(y>894)と重なっています [${item}]`);
          }
        }
        for (const item of diag.portraitOverlaps) {
          const key = `port:${item}`;
          if (!reportedIssues.has(key)) {
            reportedIssues.add(key);
            warnings.push(`${ch.id} @ ${pt.t}s: 立ち絵上端(y=814)超過候補 [${item}]`);
          }
        }
        for (const item of diag.cutinOverlaps) {
          const key = `cutin:${item}`;
          if (!reportedIssues.has(key)) {
            reportedIssues.add(key);
            warnings.push(`${ch.id} @ ${pt.t}s: つむぎカットイン領域との文字重なり候補 ["${item}"]`);
          }
        }
        for (const item of diag.orphanTexts) {
          const key = `orphan:${item}`;
          if (!reportedIssues.has(key)) {
            reportedIssues.add(key);
            warnings.push(`${ch.id} @ ${pt.t}s: 孤立末尾行候補 [${item}]`);
          }
        }
      }
    }

    const smokeStatus = errors.length === 0 ? 'OK' : 'NG';
    info.push(`ブラウザ実行スモーク${smokeStatus} (${chapters.length}チャプター / 検査点${totalChecks}件 / JSエラー${totalJsErrors})`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverObj?.server) {
      await new Promise((resolve) => serverObj.server.close(() => resolve()));
    }
  }

  return { errors, warnings, info };
}
