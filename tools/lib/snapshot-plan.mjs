export function computeRecommendedSnapshots(timeline, sceneSpecs = null) {
  if (!timeline || !Array.isArray(timeline.chapters)) return [];

  const specById = new Map();
  if (sceneSpecs && Array.isArray(sceneSpecs.chapters)) {
    for (const sc of sceneSpecs.chapters) {
      if (sc && sc.id) specById.set(sc.id, sc);
    }
  }

  const rawPoints = [];

  for (const ch of timeline.chapters) {
    const chStart = Number(ch.start) || 0;
    const chDur = Number(ch.duration) || 0;
    const lines = Array.isArray(ch.lines) ? ch.lines : [];
    const cues = ch.cues && typeof ch.cues === 'object' ? ch.cues : {};
    if (lines.length === 0) continue;

    const addLocal = (localSec, critical = false) => {
      const clamped = Math.max(0.3, Math.min(Math.max(0.5, chDur - 0.3), Number(localSec) || 0.5));
      rawPoints.push({
        time: Number((chStart + clamped).toFixed(1)),
        critical,
      });
    };

    // 1. Early active frame
    if (lines[1]) {
      addLocal(Math.min(Number(lines[1].start) + 2.0, Number(lines[1].end) - 0.3), false);
    } else {
      addLocal(
        Math.min(Number(lines[0].start) + 2.0, Math.max(0.5, Number(lines[0].end) - 0.3)),
        false
      );
    }

    // 2. Phase transitions from scene-specs.json (Phase A peak + immediately after switch)
    const spec = specById.get(ch.id);
    const transitions = Array.isArray(spec?.phase_transitions) ? spec.phase_transitions : [];
    for (const pt of transitions) {
      if (!pt?.at_cue) continue;
      const tSwitch = cues[pt.at_cue];
      if (typeof tSwitch === 'number' && Number.isFinite(tSwitch)) {
        addLocal(Math.max(0.5, tSwitch - 2.0), true);
        addLocal(Math.min(Math.max(0.5, chDur - 0.5), tSwitch + 0.5), true);
      }
    }

    // 3. Every Tsumugi cut-in line
    for (const l of lines) {
      if (l.mode === 'cutin' || l.speaker === 'tsumugi') {
        const s = Number(l.start) || 0;
        const e = Number(l.end) || s + 1.0;
        addLocal(Math.min(Math.max(s + 0.5, e - 0.4), s + 2.0), true);
      }
    }

    // 4. Chapter peak / late frame
    const peakLine = lines.length >= 2 ? lines[lines.length - 2] : lines[lines.length - 1];
    if (peakLine) {
      const s = Number(peakLine.start) || 0;
      const e = Number(peakLine.end) || s + 1.0;
      addLocal(Math.min(Math.max(s + 0.5, e - 0.4), s + 2.0), false);
    }
  }

  rawPoints.sort((a, b) => a.time - b.time || (b.critical ? 1 : 0) - (a.critical ? 1 : 0));

  const kept = [];
  for (const pt of rawPoints) {
    if (pt.critical) {
      const tooCloseCritical = kept.some((k) => k.critical && Math.abs(k.time - pt.time) < 0.8);
      if (!tooCloseCritical) {
        // Replace non-critical points that sit too close (< 1.5s) to this critical point
        for (let i = kept.length - 1; i >= 0; i--) {
          if (!kept[i].critical && Math.abs(kept[i].time - pt.time) < 1.5) {
            kept.splice(i, 1);
          }
        }
        kept.push(pt);
      }
    } else {
      const nearAny = kept.some((k) => Math.abs(k.time - pt.time) < 3.0);
      if (!nearAny) {
        kept.push(pt);
      }
    }
  }

  kept.sort((a, b) => a.time - b.time);
  return Array.from(new Set(kept.map((k) => k.time)));
}
