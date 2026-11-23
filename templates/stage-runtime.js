(function () {
  window.__diagramBuilders = window.__diagramBuilders || {};
  function indexPortraits(containerEl) {
    const map = new Map();
    if (!containerEl) return map;
    const imgs = containerEl.querySelectorAll('.portrait-img');
    for (const img of imgs) {
      const emotion = img.getAttribute('data-emotion') || 'normal';
      const mouth = img.getAttribute('data-mouth') || 'closed';
      map.set(emotion + ':' + mouth, img);
    }
    return map;
  }

  function calcCaptionVisualWidth(str) {
    let w = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      w += code >= 0x20 && code <= 0x7e ? 0.55 : 1.0;
    }
    return w;
  }

  function ensureCaptionDom(rootEl, lines) {
    const dock = rootEl.querySelector('.caption-dock');
    if (!dock) return [];
    const existing = Array.from(dock.querySelectorAll('.caption-item'));
    if (existing.length > 0) return existing;

    const list = Array.isArray(lines) ? lines : [];
    const created = [];
    for (let i = 0; i < list.length; i++) {
      const line = list[i];
      const item = document.createElement('div');
      item.className = 'caption-item';
      item.setAttribute('data-line-index', String(i));
      item.style.setProperty('--speaker-color', line.speakerColor || '#2563eb');

      const row = document.createElement('div');
      row.className = 'caption-speaker-row';
      const tag = document.createElement('span');
      tag.className = 'caption-speaker-tag';
      tag.textContent = line.speakerName || line.speaker || '';
      row.appendChild(tag);

      const text = document.createElement('p');
      const captionStr = line.caption || '';
      const vw = calcCaptionVisualWidth(captionStr);
      text.className = vw > 82 ? 'caption-text is-xlong' : vw > 66 ? 'caption-text is-long' : 'caption-text';
      text.textContent = captionStr;

      item.appendChild(row);
      item.appendChild(text);
      dock.appendChild(item);
      created.push(item);
    }
    return created;
  }

  function buildPortraitTimeline(tl, actorEl, lines, speakerId, defaultEmotion, totalDuration, fps) {
    if (!actorEl) return;
    const imgMap = indexPortraits(actorEl);
    if (imgMap.size === 0) return;

    const resolveKey = function (emotion, mouth) {
      const k1 = emotion + ':' + mouth;
      if (imgMap.has(k1)) return k1;
      const k2 = defaultEmotion + ':' + mouth;
      if (imgMap.has(k2)) return k2;
      const k3 = 'normal:' + mouth;
      if (imgMap.has(k3)) return k3;
      return imgMap.keys().next().value;
    };

    const initialKey = resolveKey(defaultEmotion, 'closed');
    const rawEvents = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.speaker !== speakerId) continue;

      const start = Number(line.start) || 0;
      const end = Number(line.end) || start + 0.5;
      const emotion = line.emotion || defaultEmotion;
      const spans = Array.isArray(line.mouthSpans) && line.mouthSpans.length > 0
        ? line.mouthSpans
        : null;

      rawEvents.push({ time: start, key: resolveKey(emotion, 'closed') });

      if (spans) {
        for (const sp of spans) {
          const s = Number(sp.start);
          const e = Number(sp.end);
          if (e > s) {
            rawEvents.push({ time: s, key: resolveKey(emotion, 'open') });
            rawEvents.push({ time: e, key: resolveKey(emotion, 'closed') });
          }
        }
      } else {
        const step = 0.16;
        const pulses = Math.max(1, Math.floor((end - start) / step));
        for (let p = 0; p < pulses; p++) {
          const tOpen = start + p * step;
          const tClose = Math.min(end, tOpen + step * 0.55);
          rawEvents.push({ time: tOpen, key: resolveKey(emotion, 'open') });
          rawEvents.push({ time: tClose, key: resolveKey(emotion, 'closed') });
        }
      }

      rawEvents.push({ time: end, key: resolveKey(emotion, 'closed') });
    }

    rawEvents.sort(function (a, b) { return a.time - b.time; });

    const maxFrame = Math.max(1, Math.floor(totalDuration * fps) - 1);
    const frameMap = new Map();
    for (const ev of rawEvents) {
      const frameIdx = Math.max(1, Math.min(maxFrame, Math.round(ev.time * fps)));
      frameMap.set(frameIdx, ev.key);
    }

    const sortedFrames = Array.from(frameMap.keys()).sort(function (a, b) { return a - b; });
    let currentKey = initialKey;
    const stepDur = 0.001;
    const lead = 0.002;

    for (const frameIdx of sortedFrames) {
      const nextKey = frameMap.get(frameIdx);
      if (nextKey === currentKey) continue;

      const prevEl = imgMap.get(currentKey);
      const nextEl = imgMap.get(nextKey);
      if (!nextEl) continue;

      const tMid = (frameIdx - 0.5) / fps;
      const tIn = Math.max(0, tMid - lead);

      tl.to(nextEl, { opacity: 1, duration: stepDur, ease: 'none' }, tIn);
      if (prevEl) {
        tl.to(prevEl, { opacity: 0, duration: stepDur, ease: 'none' }, tMid);
      }
      currentKey = nextKey;
    }
  }

  // ---- Shared Deterministic Motion Helpers (window.dgMotion) ----
  function isSvgElement(el) {
    return Boolean(el && (el instanceof SVGElement || (el.namespaceURI && el.namespaceURI.indexOf('svg') >= 0)));
  }

  function resolveElements(target, scope) {
    if (!target) return [];
    const root = scope || document;
    if (typeof target === 'string') {
      return Array.from(root.querySelectorAll(target));
    }
    if (target instanceof Element) {
      return [target];
    }
    if (Array.isArray(target) || (typeof NodeList !== 'undefined' && target instanceof NodeList)) {
      const out = [];
      for (let i = 0; i < target.length; i++) {
        const sub = resolveElements(target[i], root);
        for (let j = 0; j < sub.length; j++) {
          if (out.indexOf(sub[j]) === -1) out.push(sub[j]);
        }
      }
      return out;
    }
    return [];
  }

  function partitionElements(els) {
    const htmlEls = [];
    const svgEls = [];
    for (let i = 0; i < els.length; i++) {
      if (isSvgElement(els[i])) svgEls.push(els[i]);
      else htmlEls.push(els[i]);
    }
    return { htmlEls, svgEls };
  }

  const dgMotion = {
    resolveElements: resolveElements,

    reveal: function (tl, target, atTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(target, cfg.scope);
      if (!els.length) return els;
      const y = typeof cfg.y === 'number' ? cfg.y : 14;
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.42;
      const stagger = typeof cfg.stagger === 'number' ? cfg.stagger : 0;
      const ease = cfg.ease || 'power2.out';
      gsap.set(els, { opacity: 0, y: y });
      tl.to(els, { opacity: 1, y: 0, duration: duration, stagger: stagger, ease: ease }, atTime);
      return els;
    },

    unfocus: function (tl, groupTarget, atTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(groupTarget, cfg.scope);
      if (!els.length) return els;
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.3;
      const parts = partitionElements(els);
      if (parts.htmlEls.length) {
        tl.to(parts.htmlEls, { opacity: 1, scale: 1, boxShadow: 'none', duration: duration, ease: 'power2.out' }, atTime);
      }
      if (parts.svgEls.length) {
        tl.to(parts.svgEls, { opacity: 1, filter: 'none', duration: duration, ease: 'power2.out' }, atTime);
      }
      return els;
    },

    focus: function (tl, activeTarget, groupTarget, atTime, opts) {
      const cfg = opts || {};
      const activeEls = resolveElements(activeTarget, cfg.scope);
      const groupEls = groupTarget ? resolveElements(groupTarget, cfg.scope) : [];
      const dimOpacity = typeof cfg.dimOpacity === 'number' ? cfg.dimOpacity : 0.48;
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.35;
      const scale = typeof cfg.scale === 'number' ? cfg.scale : 1.02;
      const glowShadow = cfg.glowShadow || 'var(--shadow-focus, 0 0 0 4px rgba(37, 99, 235, 0.25))';
      const svgGlow = cfg.svgGlow || 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.45))';

      const dimEls = groupEls.filter(function (el) { return activeEls.indexOf(el) === -1; });
      if (dimEls.length) {
        const dimParts = partitionElements(dimEls);
        if (dimParts.htmlEls.length) {
          tl.to(dimParts.htmlEls, { opacity: dimOpacity, scale: 1, boxShadow: 'none', duration: duration, ease: 'power2.out' }, atTime);
        }
        if (dimParts.svgEls.length) {
          tl.to(dimParts.svgEls, { opacity: dimOpacity, filter: 'none', duration: duration, ease: 'power2.out' }, atTime);
        }
      }

      if (activeEls.length) {
        const actParts = partitionElements(activeEls);
        if (actParts.htmlEls.length) {
          tl.to(actParts.htmlEls, { opacity: 1, scale: scale, boxShadow: glowShadow, duration: duration, ease: 'power2.out' }, atTime);
        }
        if (actParts.svgEls.length) {
          tl.to(actParts.svgEls, { opacity: 1, filter: svgGlow, duration: duration, ease: 'power2.out' }, atTime);
        }
      }

      if (typeof cfg.until === 'number' && cfg.until > atTime) {
        const restoreEls = groupEls.length ? groupEls : activeEls;
        dgMotion.unfocus(tl, restoreEls, cfg.until, { duration: duration, scope: cfg.scope });
      }
      return activeEls;
    },

    pulse: function (tl, target, startTime, endTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(target, cfg.scope);
      if (!els.length) return els;
      const span = Math.max(0.4, (Number(endTime) || startTime + 1.2) - startTime);
      const halfDur = typeof cfg.duration === 'number' ? cfg.duration : 0.55;
      const cycles = Math.max(1, Math.floor(span / (halfDur * 2)));
      const stepDur = span / (cycles * 2);
      const repeatCount = cycles * 2 - 1;
      const minOpacity = typeof cfg.minOpacity === 'number' ? cfg.minOpacity : 0.48;
      const scale = typeof cfg.scale === 'number' ? cfg.scale : 1.04;

      const parts = partitionElements(els);
      if (parts.htmlEls.length) {
        tl.to(parts.htmlEls, {
          scale: scale,
          opacity: minOpacity,
          duration: stepDur,
          repeat: repeatCount,
          yoyo: true,
          ease: 'sine.inOut'
        }, startTime);
        tl.set(parts.htmlEls, { scale: 1, opacity: 1 }, startTime + span);
      }

      for (let i = 0; i < parts.svgEls.length; i++) {
        const el = parts.svgEls[i];
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'circle' && el.hasAttribute('r') && cfg.mode !== 'opacity') {
          const baseR = Number(el.getAttribute('r')) || 8;
          const targetR = Number((baseR * (typeof cfg.radiusScale === 'number' ? cfg.radiusScale : 1.32)).toFixed(2));
          tl.to(el, {
            attr: { r: targetR },
            opacity: minOpacity,
            duration: stepDur,
            repeat: repeatCount,
            yoyo: true,
            ease: 'sine.inOut'
          }, startTime);
          tl.set(el, { attr: { r: baseR }, opacity: 1 }, startTime + span);
        } else {
          tl.to(el, {
            opacity: minOpacity,
            duration: stepDur,
            repeat: repeatCount,
            yoyo: true,
            ease: 'sine.inOut'
          }, startTime);
          tl.set(el, { opacity: 1 }, startTime + span);
        }
      }
      return els;
    },

    drawPath: function (tl, pathTarget, atTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(pathTarget, cfg.scope);
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.9;
      const ease = cfg.ease || 'power2.inOut';
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (typeof el.getTotalLength !== 'function') continue;
        const len = Math.max(1, el.getTotalLength());
        const startAt = atTime + i * (cfg.stagger || 0);
        gsap.set(el, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 });
        tl.to(el, { opacity: 1, duration: 0.01, ease: 'none' }, startAt);
        tl.to(el, { strokeDashoffset: 0, duration: duration, ease: ease }, startAt);
      }
      return els;
    },

    flowDash: function (tl, pathTarget, startTime, endTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(pathTarget, cfg.scope);
      if (!els.length) return els;
      const span = Math.max(0.2, (Number(endTime) || startTime + 2) - startTime);
      const speed = typeof cfg.speed === 'number' ? cfg.speed : 38;
      const direction = cfg.direction === -1 ? -1 : 1;
      const dash = cfg.dash || '10 8';
      const opacity = typeof cfg.opacity === 'number' ? cfg.opacity : 0.95;
      const distance = speed * span * direction;

      gsap.set(els, { strokeDasharray: dash, strokeDashoffset: 0, opacity: cfg.initialOpacity ?? opacity });
      if (typeof cfg.initialOpacity === 'number') {
        tl.set(els, { opacity: opacity }, startTime);
      }
      tl.to(els, { strokeDashoffset: -distance, duration: span, ease: 'none' }, startTime);
      return els;
    },

    countUp: function (tl, textTarget, fromVal, toVal, atTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(textTarget, cfg.scope);
      if (!els.length) return els;
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.9;
      const decimals = typeof cfg.decimals === 'number' ? cfg.decimals : 0;
      const prefix = cfg.prefix || '';
      const suffix = cfg.suffix || '';
      const ease = cfg.ease || 'power2.out';
      const useSep = Boolean(cfg.separator);

      const formatVal = function (val) {
        const rounded = decimals > 0 ? Number(val).toFixed(decimals) : String(Math.round(val));
        const body = useSep ? Number(rounded).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : rounded;
        return prefix + body + suffix;
      };

      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const state = { val: Number(fromVal) || 0 };
        el.textContent = formatVal(state.val);
        tl.fromTo(
          state,
          { val: Number(fromVal) || 0 },
          {
            val: Number(toVal) || 0,
            duration: duration,
            ease: ease,
            immediateRender: true,
            onUpdate: function () {
              el.textContent = formatVal(state.val);
            }
          },
          atTime
        );
      }
      return els;
    },

    barGrow: function (tl, barTarget, atTime, opts) {
      const cfg = opts || {};
      const els = resolveElements(barTarget, cfg.scope);
      if (!els.length) return els;
      const from = typeof cfg.from === 'number' ? cfg.from : 0;
      const to = typeof cfg.to === 'number' ? cfg.to : 1;
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.7;
      const stagger = typeof cfg.stagger === 'number' ? cfg.stagger : 0.1;
      const ease = cfg.ease || 'power2.out';
      const origin = cfg.origin || 'left center';

      gsap.set(els, { scaleX: from, transformOrigin: origin });
      tl.to(els, { scaleX: to, duration: duration, stagger: stagger, ease: ease }, atTime);
      return els;
    },

    switchPhase: function (tl, outTarget, inTarget, atTime, opts) {
      const cfg = opts || {};
      const outEls = resolveElements(outTarget, cfg.scope);
      const inEls = resolveElements(inTarget, cfg.scope);
      const duration = typeof cfg.duration === 'number' ? cfg.duration : 0.18;
      const ease = cfg.ease || 'none';
      if (outEls.length) gsap.set(outEls, { opacity: 1 });
      if (inEls.length) gsap.set(inEls, { opacity: 0 });
      if (inEls.length) tl.to(inEls, { opacity: 1, duration: duration, ease: ease }, atTime);
      if (outEls.length) tl.to(outEls, { opacity: 0, duration: duration, ease: ease }, atTime);
      return { outEls: outEls, inEls: inEls };
    }
  };

  window.dgMotion = dgMotion;

  window.populateLearnVideoChapter = function (tl, rootEl, compId, data) {
    if (!tl || !rootEl || !data || typeof gsap === 'undefined') {
      return;
    }

    const totalChapterDuration = Math.max(0.5, Number(data.duration) || 1);
    const fps = Number(data.fps) || 30;

    // 1. Progress bar spanning exact chapter duration
    const progressEl = rootEl.querySelector('.chapter-progress-fill');
    if (progressEl) {
      const startRatio = Number(data.progressStartRatio ?? 0);
      const endRatio = Number(data.progressEndRatio ?? 1);
      tl.fromTo(
        progressEl,
        { scaleX: startRatio },
        { scaleX: endRatio, duration: totalChapterDuration, ease: 'none' },
        0
      );
    } else {
      tl.to({}, { duration: totalChapterDuration }, 0);
    }

    const metanActor = rootEl.querySelector('.char-metan');
    const zundamonActor = rootEl.querySelector('.char-zundamon');
    const tsumugiCutin = rootEl.querySelector('.tsumugi-cutin');

    if (metanActor) {
      gsap.set(metanActor, { scale: 0.96, y: 8, opacity: 0.88 });
    }
    if (zundamonActor) {
      gsap.set(zundamonActor, { scale: 0.96, y: 8, opacity: 0.88 });
    }
    if (tsumugiCutin) {
      gsap.set(tsumugiCutin, { opacity: 0, x: 160, scale: 0.92 });
    }

    const lines = Array.isArray(data.lines) ? data.lines : [];
    const captionItems = ensureCaptionDom(rootEl, lines);
    const captionByIndex = new Map();
    for (const item of captionItems) {
      captionByIndex.set(item.getAttribute('data-line-index'), item);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      const start = Number(line.start) || 0;
      const end = Number(line.end) || start + 0.5;
      const duration = Math.max(0.1, end - start);

      // 2. Caption stack item
      const capEl = captionByIndex.get(String(i));
      if (capEl) {
        gsap.set(capEl, { opacity: 0, y: 8 });
        const fadeIn = Math.min(0.08, duration * 0.25);
        const holdUntil = nextLine
          ? nextLine.start
          : Math.min(totalChapterDuration - 0.08, end + 0.45);
        const fadeOutStart = Math.max(start + fadeIn, holdUntil - 0.06);

        tl.fromTo(
          capEl,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: fadeIn, ease: 'power2.out' },
          start
        );
        tl.to(
          capEl,
          { opacity: 0, duration: 0.06, ease: 'none' },
          fadeOutStart
        );
      }

      // 3. Standing actor active bounce / focus
      const actorEl =
        line.speaker === 'metan'
          ? metanActor
          : line.speaker === 'zundamon'
            ? zundamonActor
            : null;

      if (actorEl) {
        tl.to(
          actorEl,
          { scale: 1.03, y: -8, opacity: 1, duration: 0.14, ease: 'power2.out' },
          start
        );
        tl.to(
          actorEl,
          { scale: 0.96, y: 8, opacity: 0.88, duration: 0.16, ease: 'power2.inOut' },
          end
        );
      }

      // 4. Tsumugi cut-in panel slide in/out
      if (tsumugiCutin && (line.speaker === 'tsumugi' || line.mode === 'cutin')) {
        const prevIsTsumugi =
          i > 0 && (lines[i - 1].speaker === 'tsumugi' || lines[i - 1].mode === 'cutin');
        const nextIsTsumugi =
          nextLine && (nextLine.speaker === 'tsumugi' || nextLine.mode === 'cutin');

        if (!prevIsTsumugi) {
          const enterAt = Math.max(0, start - 0.25);
          tl.to(
            tsumugiCutin,
            { opacity: 1, x: 0, scale: 1, duration: 0.24, ease: 'back.out(1.4)' },
            enterAt
          );
        }

        if (!nextIsTsumugi) {
          const exitAt = Math.min(totalChapterDuration - 0.22, end + 0.32);
          tl.to(
            tsumugiCutin,
            { opacity: 0, x: 160, scale: 0.92, duration: 0.2, ease: 'power2.in' },
            exitAt
          );
        }
      }
    }

    // 5. Lip-sync & expression swaps using exported PNGs
    buildPortraitTimeline(tl, metanActor, lines, 'metan', 'normal', totalChapterDuration, fps);
    buildPortraitTimeline(tl, zundamonActor, lines, 'zundamon', 'normal', totalChapterDuration, fps);
    buildPortraitTimeline(tl, tsumugiCutin, lines, 'tsumugi', 'sharp', totalChapterDuration, fps);

    // 6. Per-chapter diagram animation builder
    const builders = window.__diagramBuilders || {};
    if (typeof builders[compId] === 'function') {
      builders[compId](tl, data.cues || {}, data, rootEl);
    }
  };
})();
