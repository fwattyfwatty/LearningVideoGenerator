import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { ensureVoicevoxReady } from './lib/voicevox-launcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const voicevoxUrl = (process.env.VOICEVOX_URL || 'http://127.0.0.1:50021').replace(/\/$/, '');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

async function main() {
  const autoStart = !process.argv.slice(2).includes('--no-auto-start') && process.env.VOICEVOX_AUTO_START !== '0';
  console.log(`Checking VOICEVOX Engine at ${voicevoxUrl} ...`);

  let version;
  let speakers;
  try {
    const ready = await ensureVoicevoxReady({ voicevoxUrl, autoStart });
    version = ready.version;
    speakers = await fetchJson(`${voicevoxUrl}/speakers`);
  } catch (err) {
    console.error('\n[ERROR] VOICEVOX Engine に接続できませんでした。');
    console.error('VOICEVOX アプリ（または VOICEVOX Engine）を起動してから再実行してください。');
    console.error(`接続先: ${voicevoxUrl}`);
    console.error(`詳細: ${err.message}`);
    process.exit(1);
  }

  console.log(`Connected! VOICEVOX Engine version: ${version}\n`);

  const charPath = path.join(rootDir, 'config', 'characters.yaml');
  const characters = yaml.load(await fs.readFile(charPath, 'utf8'));

  const speakerMap = new Map();
  for (const sp of speakers) {
    const styleById = new Map();
    for (const st of sp.styles || []) {
      styleById.set(st.id, st.name);
    }
    speakerMap.set(sp.name, { styles: sp.styles || [], styleById });
  }

  let hasError = false;
  for (const [key, char] of Object.entries(characters)) {
    const engineSpeaker = speakerMap.get(char.speaker_name);
    if (!engineSpeaker) {
      console.error(`[NG] ${key}: "${char.speaker_name}" が VOICEVOX 側に存在しません。`);
      hasError = true;
      continue;
    }

    console.log(`[OK] ${key} (${char.speaker_name})`);
    for (const [styleKey, styleId] of Object.entries(char.styles || {})) {
      const actualName = engineSpeaker.styleById.get(styleId);
      if (actualName) {
        const isDefault = styleKey === char.default_style ? ' *default' : '';
        console.log(`     - ${styleKey}: ID=${styleId} (${actualName})${isDefault}`);
      } else {
        console.error(`     - [NG] ${styleKey}: ID=${styleId} が見つかりません`);
        hasError = true;
      }
    }
  }

  if (hasError) {
    console.error('\nconfig/characters.yaml の speaker ID 設定に不一致があります。');
    process.exit(1);
  }

  console.log('\n全キャラクターの VOICEVOX ID 検証に成功しました。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
