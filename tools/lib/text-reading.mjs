import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readYamlDict(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = yaml.load(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadMergedDictionary(rootDir, episodeDir = null) {
  const globalDict = await readYamlDict(path.join(rootDir, 'config', 'dictionary.yaml'));
  if (!episodeDir) return globalDict;
  const localDict = await readYamlDict(path.join(episodeDir, 'dictionary.yaml'));
  return { ...globalDict, ...localDict };
}

export function applyDictionary(text, dictionary) {
  let result = String(text || '')
    // 単位の自動正規化
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*nm(?![A-Za-z])/g, '$1ナノメートル')
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*μm(?![A-Za-z])/g, '$1マイクロメートル')
    .replace(/(?<![A-Za-z])(\d+)\s*D(?![A-Za-z])/g, '$1ディー')
    // 数値範囲・年号範囲の自動正規化（例: 2022〜23年 -> 2022年から2023年, 3.75〜4.00% -> 3.75から4.00パーセント）
    .replace(/(?<!\d)(\d{2})(\d{2})\s*[〜～]\s*(\d{2})\s*年/g, '$1$2年から$1$3年')
    .replace(/(?<!\d)(\d{4})\s*[〜～]\s*(\d{4})\s*年/g, '$1年から$2年')
    .replace(/(?<!\d)(\d+(?:\.\d+)?)\s*[〜～]\s*(\d+(?:\.\d+)?)\s*%/g, '$1から$2パーセント')
    .replace(/(?<!\d)(\d+(?:\.\d+)?)\s*[〜～]\s*(\d+(?:\.\d+)?)\s*(年|か月|ヶ月|カ月|時間|日|人|回|倍|歳|世紀|ステップ)/g, '$1から$2$3')
    .replace(/(?<!\d)(\d+(?:\.\d+)?)\s*%/g, '$1パーセント');

  if (!dictionary || typeof dictionary !== 'object') return result;
  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [term, reading] of entries) {
    if (!term) continue;
    const isAsciiTerm = /^[A-Za-z0-9 ._-]+$/.test(term);
    const pattern = isAsciiTerm
      ? new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, 'g')
      : new RegExp(escapeRegExp(term), 'g');
    result = result.replace(pattern, String(reading));
  }
  return result;
}
