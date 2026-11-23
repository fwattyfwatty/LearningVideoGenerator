(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let uidCounter = 0;

  function nextUid(prefix) {
    uidCounter += 1;
    return (prefix || 'dg-w') + '-' + uidCounter;
  }

  function resolveContainer(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target instanceof Element ? target : null;
  }

  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (attrs[k] !== undefined && attrs[k] !== null) {
          el.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (text !== undefined && text !== null) {
      el.textContent = String(text);
    }
    return el;
  }

  function toneColor(tone) {
    if (tone === 'ok') return 'var(--accent-ok, #16a34a)';
    if (tone === 'warn') return 'var(--accent-warn, #d97706)';
    if (tone === 'danger') return 'var(--accent-danger, #dc2626)';
    if (tone === 'secondary') return 'var(--accent-secondary, #0ea5e9)';
    return 'var(--accent-primary, #2563eb)';
  }

  function createOpenArrowMarker(defs, id, strokeColor) {
    const marker = svgEl('marker', {
      id: id,
      viewBox: '0 0 12 12',
      refX: 10,
      refY: 6,
      markerWidth: 11,
      markerHeight: 11,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto'
    });
    marker.appendChild(svgEl('path', {
      d: 'M2 2.5 L10 6 L2 9.5',
      fill: 'none',
      stroke: strokeColor,
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }));
    defs.appendChild(marker);
    return marker;
  }

  function appendMultilineSvgText(parent, lines, x, y, attrs, lineHeight) {
    const lh = lineHeight || 20;
    const baseAttrs = Object.assign({
      'font-family': 'Noto Sans JP, sans-serif',
      x: x,
      y: y
    }, attrs || {});
    const txt = svgEl('text', baseAttrs);
    for (let i = 0; i < lines.length; i++) {
      const tspan = svgEl('tspan', {
        x: x,
        dy: i === 0 ? 0 : lh
      }, lines[i]);
      txt.appendChild(tspan);
    }
    parent.appendChild(txt);
    return txt;
  }

  function estimateTextWidthPx(str, fontSize) {
    const s = String(str || '');
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      total += code >= 0x20 && code <= 0x7e ? fontSize * 0.58 : fontSize;
    }
    return total;
  }

  function fitSvgFontSize(str, maxWidthPx, baseSize, minSize) {
    const floor = typeof minSize === 'number' ? minSize : 12;
    const w = estimateTextWidthPx(str, baseSize);
    if (w <= maxWidthPx || w <= 0) return baseSize;
    return Math.max(floor, Number((baseSize * maxWidthPx / w).toFixed(1)));
  }

  function wrapSvgText(text, maxWidthPx, fontSize, maxLines) {
    if (Array.isArray(text)) {
      const sizes = text.map(function (l) {
        return fitSvgFontSize(l, maxWidthPx, fontSize, 12);
      });
      return { lines: text, fontSize: Math.min.apply(null, sizes) };
    }
    const s = String(text || '');
    const limit = typeof maxLines === 'number' ? maxLines : 2;
    if (estimateTextWidthPx(s, fontSize) <= maxWidthPx || limit <= 1) {
      return { lines: [s], fontSize: fitSvgFontSize(s, maxWidthPx, fontSize, 12) };
    }

    const startIdx = Math.floor(s.length * 0.3);
    const endIdx = Math.min(s.length - 1, Math.ceil(s.length * 0.72));
    const mid = s.length / 2;
    const afterDelims = ['・', '／', '、', ' ', '→'];
    let bestBreak = -1;
    let bestDist = Infinity;

    for (let k = startIdx; k <= endIdx; k++) {
      const ch = s.charAt(k);
      let br = -1;
      if (afterDelims.indexOf(ch) !== -1 && k + 1 < s.length - 1) {
        br = k + 1;
      } else if (ch === '（' && k > 1) {
        br = k;
      }
      if (br > 0) {
        const dist = Math.abs(br - mid);
        if (dist < bestDist) {
          bestDist = dist;
          bestBreak = br;
        }
      }
    }

    if (bestBreak < 0) {
      bestBreak = Math.max(2, Math.min(s.length - 3, Math.ceil(s.length / 2)));
    }

    const line1 = s.slice(0, bestBreak).trim();
    const line2 = s.slice(bestBreak).trim();
    if (!line1 || !line2) {
      return { lines: [s], fontSize: fitSvgFontSize(s, maxWidthPx, fontSize, 12) };
    }
    const fittedSize = Math.min(
      fitSvgFontSize(line1, maxWidthPx, fontSize, 12),
      fitSvgFontSize(line2, maxWidthPx, fontSize, 12)
    );
    return { lines: [line1, line2], fontSize: fittedSize };
  }

  const dgWidgets = {
    lineChart: function (container, tl, config) {
      const root = resolveContainer(container);
      const cfg = config || {};
      const points = Array.isArray(cfg.points) ? cfg.points : [];
      if (!root || points.length === 0) return null;

      const W = cfg.width || 660;
      const H = cfg.height || 290;
      const padL = cfg.padL || 68;
      const padR = cfg.padR || 38;
      const padT = cfg.padT || 44;
      const padB = cfg.padB || 62;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const strokeColor = cfg.color || toneColor(cfg.tone);
      const gradId = nextUid('dg-lc-grad');

      const values = points.map(function (p) { return Number(p.value) || 0; });
      const rawMin = Math.min.apply(null, values);
      const rawMax = Math.max.apply(null, values);
      const yMin = typeof cfg.yMin === 'number' ? cfg.yMin : Math.floor(Math.min(0, rawMin));
      const yMax = typeof cfg.yMax === 'number' ? cfg.yMax : Math.ceil(rawMax * 1.15 || 1);
      const ySpan = Math.max(0.0001, yMax - yMin);
      const yUnit = cfg.yUnit || '';

      const svg = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': cfg.ariaLabel || '折れ線チャート'
      });
      svg.style.width = '100%';
      svg.style.height = '100%';

      const defs = svgEl('defs');
      const grad = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
      grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': strokeColor, 'stop-opacity': '0.28' }));
      grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': strokeColor, 'stop-opacity': '0.02' }));
      defs.appendChild(grad);
      svg.appendChild(defs);

      const ticks = Array.isArray(cfg.yTicks) && cfg.yTicks.length > 0
        ? cfg.yTicks
        : [yMin, yMin + ySpan * 0.5, yMax];

      for (let i = 0; i < ticks.length; i++) {
        const tv = Number(ticks[i]);
        const ty = padT + plotH - ((tv - yMin) / ySpan) * plotH;
        svg.appendChild(svgEl('line', {
          x1: padL, y1: ty.toFixed(1), x2: W - padR, y2: ty.toFixed(1),
          stroke: 'var(--border-subtle, #cbd5e1)',
          'stroke-dasharray': '5 6',
          'stroke-width': 1.5
        }));
        svg.appendChild(svgEl('text', {
          x: padL - 10,
          y: (ty + 5).toFixed(1),
          'text-anchor': 'end',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': 15,
          'font-weight': 700,
          fill: 'var(--text-secondary, #475569)'
        }, (Number.isInteger(tv) ? String(tv) : tv.toFixed(1)) + yUnit));
      }

      svg.appendChild(svgEl('path', {
        d: 'M' + padL + ' ' + padT + ' V' + (padT + plotH) + ' H' + (W - padR),
        fill: 'none',
        stroke: 'var(--border-strong, #94a3b8)',
        'stroke-width': 2
      }));

      const coords = points.map(function (p, idx) {
        const rx = points.length === 1 ? 0.5 : idx / (points.length - 1);
        const x = padL + rx * plotW;
        const y = padT + plotH - (((Number(p.value) || 0) - yMin) / ySpan) * plotH;
        return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), data: p };
      });

      let lineD = '';
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        if (i === 0) {
          lineD += 'M' + c.x + ' ' + c.y;
        } else if (cfg.mode === 'step') {
          const prev = coords[i - 1];
          lineD += ' H' + c.x + ' V' + c.y;
        } else {
          lineD += ' L' + c.x + ' ' + c.y;
        }
      }

      let areaEl = null;
      if (cfg.area !== false && coords.length > 0) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        const baseLine = padT + plotH;
        const areaD = lineD + ' L' + last.x + ' ' + baseLine + ' L' + first.x + ' ' + baseLine + ' Z';
        areaEl = svgEl('path', { d: areaD, fill: 'url(#' + gradId + ')' });
        svg.appendChild(areaEl);
      }

      const linePath = svgEl('path', {
        d: lineD,
        fill: 'none',
        stroke: strokeColor,
        'stroke-width': 4.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      svg.appendChild(linePath);

      const nodeItems = [];
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const p = c.data;
        const xLblY = padT + plotH + 25;
        svg.appendChild(svgEl('text', {
          x: c.x,
          y: xLblY,
          'text-anchor': 'middle',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': 16,
          'font-weight': 800,
          fill: 'var(--text-primary, #0f172a)'
        }, p.label || ''));

        if (p.sub) {
          svg.appendChild(svgEl('text', {
            x: c.x,
            y: xLblY + 21,
            'text-anchor': 'middle',
            'font-family': 'Noto Sans JP, sans-serif',
            'font-size': 15,
            'font-weight': 700,
            fill: 'var(--text-secondary, #475569)'
          }, p.sub));
        }

        const nodeGroup = svgEl('g');
        const dot = svgEl('circle', {
          cx: c.x,
          cy: c.y,
          r: p.highlight ? 8 : 6,
          fill: p.highlight ? strokeColor : 'var(--bg-card, #ffffff)',
          stroke: p.highlight ? 'var(--bg-card, #ffffff)' : strokeColor,
          'stroke-width': p.highlight ? 3 : 3
        });

        let ring = null;
        if (p.highlight) {
          ring = svgEl('circle', {
            cx: c.x,
            cy: c.y,
            r: 15,
            fill: strokeColor,
            opacity: 0.2
          });
          nodeGroup.appendChild(ring);
        }
        nodeGroup.appendChild(dot);

        if (p.badge) {
          const textW = Math.max(84, String(p.badge).length * 14 + 26);
          const bx = Math.max(padL + 6, Math.min(W - textW - 6, c.x - textW / 2));
          const by = Math.max(4, c.y - 44);
          nodeGroup.appendChild(svgEl('rect', {
            x: bx, y: by, width: textW, height: 28, rx: 9,
            fill: 'var(--bg-card, #ffffff)',
            stroke: strokeColor,
            'stroke-width': 2
          }));
          nodeGroup.appendChild(svgEl('text', {
            x: bx + textW / 2,
            y: by + 19,
            'text-anchor': 'middle',
            'font-family': 'Noto Sans JP, sans-serif',
            'font-size': 15,
            'font-weight': 800,
            fill: strokeColor
          }, p.badge));
        }

        svg.appendChild(nodeGroup);
        nodeItems.push({ group: nodeGroup, dot: dot, ring: ring, data: p });
      }

      root.innerHTML = '';
      root.appendChild(svg);

      if (tl && window.dgMotion) {
        const at = typeof cfg.at === 'number' ? cfg.at : 0.45;
        const dur = typeof cfg.duration === 'number' ? cfg.duration : 1.1;
        window.dgMotion.drawPath(tl, linePath, at, { duration: dur });
        if (areaEl) {
          gsap.set(areaEl, { opacity: 0 });
          tl.to(areaEl, { opacity: 1, duration: 0.5, ease: 'power2.out' }, at + dur * 0.45);
        }
        for (let i = 0; i < nodeItems.length; i++) {
          const item = nodeItems[i];
          const nodeTime = typeof item.data.at === 'number'
            ? item.data.at
            : (item.data.highlight && typeof cfg.highlightAt === 'number')
              ? cfg.highlightAt
              : at + (dur * (i / Math.max(1, nodeItems.length - 1)));
          gsap.set(item.group, { opacity: 0 });
          tl.to(item.group, { opacity: 1, duration: 0.28, ease: 'power2.out' }, nodeTime);
          if (item.data.highlight && item.ring) {
            const pulseStart = typeof cfg.highlightAt === 'number' ? cfg.highlightAt + 0.15 : nodeTime + 0.15;
            const pulseEnd = typeof cfg.pulseEnd === 'number' ? cfg.pulseEnd : pulseStart + 3.0;
            window.dgMotion.pulse(tl, item.ring, pulseStart, pulseEnd, { radiusScale: 1.35, minOpacity: 0.12 });
          }
        }
      }

      return { svg: svg, linePath: linePath, areaEl: areaEl, items: nodeItems };
    },

    barChart: function (container, tl, config) {
      const root = resolveContainer(container);
      const cfg = config || {};
      const items = Array.isArray(cfg.items) ? cfg.items : [];
      if (!root || items.length === 0) return null;

      const wrap = document.createElement('div');
      wrap.className = 'dg-col';
      wrap.style.gap = (cfg.gap || 12) + 'px';
      wrap.style.height = 'auto';
      wrap.style.width = '100%';

      const maxVal = typeof cfg.max === 'number'
        ? cfg.max
        : Math.max.apply(null, items.map(function (it) { return Number(it.value) || 0; }).concat([1]));
      const unit = cfg.unit || '';
      const baseAt = typeof cfg.at === 'number' ? cfg.at : 0.45;
      const stagger = typeof cfg.stagger === 'number' ? cfg.stagger : 0.2;

      const rowHandles = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const row = document.createElement('div');
        row.className = 'dg-col';
        row.style.gap = '6px';
        row.style.height = 'auto';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'baseline';
        header.style.gap = '10px';

        const lbl = document.createElement('span');
        lbl.style.fontSize = '18px';
        lbl.style.fontWeight = '800';
        lbl.style.color = 'var(--text-primary)';
        lbl.textContent = it.label || '';

        const valEl = document.createElement('span');
        valEl.style.fontSize = '18px';
        valEl.style.fontWeight = '800';
        valEl.style.color = it.tone ? toneColor(it.tone) : 'var(--accent-primary)';
        valEl.textContent = it.text || (String(it.value) + unit);

        header.appendChild(lbl);
        header.appendChild(valEl);
        row.appendChild(header);

        const track = document.createElement('div');
        track.className = 'dg-bar-track';
        const fill = document.createElement('div');
        fill.className = 'dg-bar-fill' + (
          it.tone === 'warn' || it.tone === 'danger'
            ? ' dg-bar-fill-warn'
            : it.tone === 'ok'
              ? ' dg-bar-fill-ok'
              : it.tone === 'secondary'
                ? ' dg-bar-fill-secondary'
                : ''
        );
        track.appendChild(fill);
        row.appendChild(track);

        if (it.sub) {
          const sub = document.createElement('span');
          sub.style.fontSize = '15px';
          sub.style.fontWeight = '700';
          sub.style.color = 'var(--text-secondary)';
          sub.textContent = it.sub;
          row.appendChild(sub);
        }

        wrap.appendChild(row);
        rowHandles.push({ row: row, fill: fill, valueEl: valEl, data: it });
      }

      root.innerHTML = '';
      root.appendChild(wrap);

      if (tl && window.dgMotion) {
        for (let i = 0; i < rowHandles.length; i++) {
          const rh = rowHandles[i];
          const itemAt = typeof rh.data.at === 'number' ? rh.data.at : baseAt + i * stagger;
          const ratio = Math.max(0.05, Math.min(1, (Number(rh.data.value) || 0) / (Number(rh.data.max) || maxVal)));
          window.dgMotion.reveal(tl, rh.row, itemAt, { y: 10, duration: 0.32 });
          window.dgMotion.barGrow(tl, rh.fill, itemAt + 0.08, { to: ratio, duration: 0.7 });
          if (cfg.countUp && !rh.data.text && typeof rh.data.value === 'number') {
            window.dgMotion.countUp(tl, rh.valueEl, 0, rh.data.value, itemAt + 0.08, {
              duration: 0.7,
              decimals: Number.isInteger(rh.data.value) ? 0 : 1,
              suffix: unit
            });
          }
        }
      }

      return { root: wrap, items: rowHandles };
    },

    gauge: function (container, tl, config) {
      const root = resolveContainer(container);
      const cfg = config || {};
      if (!root) return null;

      const W = 540;
      const H = 262;
      const cx = 270;
      const cy = 178;
      const r = 110;

      const zones = Array.isArray(cfg.zones) && cfg.zones.length > 0
        ? cfg.zones
        : [
            { label: '緩和', sub: '景気刺激', color: 'var(--accent-ok, #16a34a)' },
            { label: '中立', sub: '均衡水準', color: 'var(--accent-primary, #1d4ed8)' },
            { label: '引き締め', sub: '過熱抑制', color: 'var(--accent-warn, #d97706)' }
          ];

      const svg = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': cfg.ariaLabel || 'ゲージメーター'
      });
      svg.style.width = '100%';
      svg.style.height = '100%';

      const totalDeg = 180;
      const gapDeg = 6;
      const n = zones.length;
      const segDeg = (totalDeg - gapDeg * (n - 1)) / n;

      function polar(deg) {
        const rad = (deg * Math.PI) / 180;
        return {
          x: Number((cx - r * Math.cos(rad)).toFixed(2)),
          y: Number((cy - r * Math.sin(rad)).toFixed(2))
        };
      }

      for (let i = 0; i < n; i++) {
        const startDeg = i * (segDeg + gapDeg);
        const endDeg = startDeg + segDeg;
        const p1 = polar(startDeg);
        const p2 = polar(endDeg);
        svg.appendChild(svgEl('path', {
          d: 'M ' + p1.x + ' ' + p1.y + ' A ' + r + ' ' + r + ' 0 0 1 ' + p2.x + ' ' + p2.y,
          fill: 'none',
          stroke: zones[i].color || toneColor(zones[i].tone),
          'stroke-width': 20,
          'stroke-linecap': 'round'
        }));

        const midDeg = (startDeg + endDeg) / 2;
        const anchor = n === 3 && i === 0 ? 'start' : n === 3 && i === 2 ? 'end' : 'middle';
        const lx = n === 3 && i === 0 ? 22 : n === 3 && i === 2 ? 518 : cx;
        const isTop = midDeg > 45 && midDeg < 135;
        const lLines = zones[i].sub ? [zones[i].label, zones[i].sub] : [zones[i].label];
        appendMultilineSvgText(svg, lLines, lx, isTop ? 20 : 198, {
          'text-anchor': anchor,
          'font-size': 16,
          'font-weight': 800,
          fill: 'var(--text-secondary, #475569)'
        }, 19);
      }

      const needle = svgEl('g');
      needle.appendChild(svgEl('path', {
        d: 'M' + (cx - 5) + ' ' + cy + ' L' + cx + ' ' + (cy - 88) + ' L' + (cx + 5) + ' ' + cy + ' Z',
        fill: 'var(--text-primary, #0f172a)'
      }));
      needle.appendChild(svgEl('circle', {
        cx: cx, cy: cy, r: 12,
        fill: 'var(--accent-primary, #1d4ed8)',
        stroke: 'var(--bg-card, #ffffff)',
        'stroke-width': 3
      }));
      svg.appendChild(needle);

      if (cfg.centerLabel) {
        svg.appendChild(svgEl('text', {
          x: cx,
          y: cy + 64,
          'text-anchor': 'middle',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': 18,
          'font-weight': 800,
          fill: 'var(--accent-primary, #1d4ed8)'
        }, cfg.centerLabel));
      }

      root.innerHTML = '';
      root.appendChild(svg);

      if (tl) {
        const initAngle = typeof cfg.initialAngle === 'number' ? cfg.initialAngle : 0;
        gsap.set(needle, { svgOrigin: cx + ' ' + cy, rotation: initAngle });
        const moves = Array.isArray(cfg.moves) ? cfg.moves : [];
        for (let i = 0; i < moves.length; i++) {
          const m = moves[i];
          tl.to(needle, {
            rotation: Number(m.angle) || 0,
            duration: typeof m.duration === 'number' ? m.duration : 0.9,
            ease: m.ease || 'power2.inOut',
            svgOrigin: cx + ' ' + cy
          }, m.at);
        }
      }

      return { svg: svg, needle: needle };
    },

    timeline: function (container, tl, config) {
      const root = resolveContainer(container);
      const cfg = config || {};
      const items = Array.isArray(cfg.items) ? cfg.items : [];
      if (!root || items.length === 0) return null;

      const W = cfg.width || 960;
      const H = cfg.height || 245;
      const marginX = 14;
      const gap = 18;
      const n = items.length;
      const boxW = Math.min(220, Math.floor((W - marginX * 2 - gap * Math.max(0, n - 1)) / n));
      const padX = Math.max(Math.ceil(boxW / 2) + marginX, n <= 2 ? 180 : 0);
      const axisY = 84;
      const usableW = Math.max(0, W - padX * 2);

      const svg = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': cfg.ariaLabel || 'タイムライン'
      });
      svg.style.width = '100%';
      svg.style.height = '100%';

      const axisPath = svgEl('path', {
        d: 'M' + (padX - 24) + ' ' + axisY + ' H' + (W - padX + 24),
        fill: 'none',
        stroke: 'var(--accent-primary, #1d4ed8)',
        'stroke-width': 4,
        'stroke-linecap': 'round'
      });
      svg.appendChild(axisPath);

      const handles = [];
      const groups = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const rx = items.length === 1 ? 0.5 : i / (items.length - 1);
        const x = padX + rx * usableW;
        const c = toneColor(it.tone);

        const g = svgEl('g');
        const tagW = Math.max(100, String(it.tag || '').length * 14 + 26);
        g.appendChild(svgEl('rect', {
          x: (x - tagW / 2).toFixed(1),
          y: 22,
          width: tagW,
          height: 34,
          rx: 17,
          fill: 'var(--bg-card, #ffffff)',
          stroke: c,
          'stroke-width': 2
        }));
        g.appendChild(svgEl('text', {
          x: x.toFixed(1),
          y: 45,
          'text-anchor': 'middle',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': 16,
          'font-weight': 800,
          fill: c
        }, it.tag || ''));

        g.appendChild(svgEl('circle', {
          cx: x.toFixed(1),
          cy: axisY,
          r: 10,
          fill: c,
          stroke: 'var(--bg-card, #ffffff)',
          'stroke-width': 3
        }));

        g.appendChild(svgEl('rect', {
          x: (x - boxW / 2).toFixed(1),
          y: 112,
          width: boxW,
          height: it.desc ? 112 : 76,
          rx: 16,
          fill: 'var(--bg-card, #ffffff)',
          stroke: c,
          'stroke-width': 2
        }));

        const innerW = Math.max(80, boxW - 22);
        g.appendChild(svgEl('text', {
          x: x.toFixed(1),
          y: 148,
          'text-anchor': 'middle',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': fitSvgFontSize(it.title || '', innerW, 19, 14),
          'font-weight': 800,
          fill: 'var(--text-primary, #0f172a)'
        }, it.title || ''));

        if (it.desc) {
          const descFit = wrapSvgText(it.desc, innerW, 15, 2);
          appendMultilineSvgText(g, descFit.lines, x.toFixed(1), descFit.lines.length > 1 ? 174 : 182, {
            'text-anchor': 'middle',
            'font-size': descFit.fontSize,
            'font-weight': 700,
            fill: 'var(--text-secondary, #475569)'
          }, 20);
        }

        svg.appendChild(g);
        groups.push(g);
        handles.push({ group: g, data: it });
      }

      root.innerHTML = '';
      root.appendChild(svg);

      if (tl && window.dgMotion) {
        const baseAt = typeof cfg.at === 'number' ? cfg.at : 0.45;
        const stagger = typeof cfg.stagger === 'number' ? cfg.stagger : 0.4;
        window.dgMotion.drawPath(tl, axisPath, baseAt, { duration: 0.7 });
        for (let i = 0; i < handles.length; i++) {
          const h = handles[i];
          const t = typeof h.data.at === 'number' ? h.data.at : baseAt + 0.15 + i * stagger;
          window.dgMotion.reveal(tl, h.group, t, { y: 12, duration: 0.35 });
          if (cfg.focusEach) {
            window.dgMotion.focus(tl, h.group, groups.slice(0, i + 1), t + 0.05, { dimOpacity: 0.55 });
          }
        }
        if (cfg.focusEach && typeof cfg.unfocusAt === 'number') {
          window.dgMotion.unfocus(tl, groups, cfg.unfocusAt);
        }
      }

      return { svg: svg, axisPath: axisPath, items: handles };
    },

    flowNodes: function (container, tl, config) {
      const root = resolveContainer(container);
      const cfg = config || {};
      const nodes = Array.isArray(cfg.nodes) ? cfg.nodes : [];
      if (!root || nodes.length === 0) return null;

      const W = cfg.width || 960;
      const H = cfg.height || 180;
      const n = nodes.length;
      const marginX = 24;
      const gap = n >= 4 ? 56 : 74;
      const boxW = Math.floor((W - marginX * 2 - gap * (n - 1)) / n);
      const boxH = cfg.boxHeight || 136;
      const boxY = Math.floor((H - boxH) / 2);
      const arrowColor = cfg.arrowColor || 'var(--accent-primary, #1d4ed8)';
      const markerId = nextUid('dg-fn-arrow');

      const svg = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': cfg.ariaLabel || 'プロセスフロー図'
      });
      svg.style.width = '100%';
      svg.style.height = '100%';

      const defs = svgEl('defs');
      createOpenArrowMarker(defs, markerId, arrowColor);
      svg.appendChild(defs);

      const nodeGroups = [];
      const baseArrows = [];
      const flowPaths = [];
      const handles = [];

      for (let i = 0; i < n; i++) {
        const nd = nodes[i];
        const x = marginX + i * (boxW + gap);
        const c = toneColor(nd.tone);

        const g = svgEl('g');
        g.appendChild(svgEl('rect', {
          x: x, y: boxY, width: boxW, height: boxH, rx: 16,
          fill: 'var(--bg-card, #ffffff)',
          stroke: c,
          'stroke-width': 2.5
        }));

        const innerW = Math.max(80, boxW - 22);
        const subFit = nd.sub ? wrapSvgText(nd.sub, innerW, 15, 2) : null;
        const hasTwoLineSub = Boolean(subFit && subFit.lines.length > 1);
        let titleY = boxY + (hasTwoLineSub ? 50 : (nd.sub ? 58 : 74));
        if (nd.icon) {
          const icoSize = hasTwoLineSub ? 30 : 34;
          const icoY = hasTwoLineSub ? boxY + 12 : boxY + 16;
          g.appendChild(svgEl('use', {
            href: '#' + nd.icon.replace(/^#/, ''),
            x: x + boxW / 2 - icoSize / 2,
            y: icoY,
            width: icoSize,
            height: icoSize,
            color: c
          }));
          titleY = boxY + (hasTwoLineSub ? 68 : 78);
        }

        g.appendChild(svgEl('text', {
          x: x + boxW / 2,
          y: titleY,
          'text-anchor': 'middle',
          'font-family': 'Noto Sans JP, sans-serif',
          'font-size': fitSvgFontSize(nd.title || '', innerW, 20, 14),
          'font-weight': 800,
          fill: 'var(--text-primary, #0f172a)'
        }, nd.title || ''));

        if (subFit) {
          appendMultilineSvgText(g, subFit.lines, x + boxW / 2, titleY + (hasTwoLineSub ? 23 : 26), {
            'text-anchor': 'middle',
            'font-size': subFit.fontSize,
            'font-weight': 700,
            fill: 'var(--text-secondary, #475569)'
          }, hasTwoLineSub ? 19 : 20);
        }

        svg.appendChild(g);
        nodeGroups.push(g);
        handles.push({ group: g, data: nd });

        if (i < n - 1) {
          const ax1 = x + boxW + 6;
          const ax2 = x + boxW + gap - 8;
          const ay = boxY + boxH / 2;
          const baseArrow = svgEl('path', {
            d: 'M' + ax1 + ' ' + ay + ' H' + ax2,
            fill: 'none',
            stroke: arrowColor,
            'stroke-width': 3,
            'marker-end': 'url(#' + markerId + ')'
          });
          const dashOverlay = svgEl('path', {
            d: 'M' + ax1 + ' ' + ay + ' H' + (ax2 - 6),
            fill: 'none',
            stroke: 'var(--bg-card, #ffffff)',
            'stroke-width': 3,
            opacity: 0
          });
          svg.appendChild(baseArrow);
          svg.appendChild(dashOverlay);
          baseArrows.push(baseArrow);
          flowPaths.push(dashOverlay);
        }
      }

      root.innerHTML = '';
      root.appendChild(svg);

      if (tl && window.dgMotion) {
        const baseAt = typeof cfg.at === 'number' ? cfg.at : 0.45;
        const stagger = typeof cfg.stagger === 'number' ? cfg.stagger : 0.35;
        const nodeTimes = [];
        for (let i = 0; i < handles.length; i++) {
          const h = handles[i];
          const t = typeof h.data.at === 'number' ? h.data.at : baseAt + i * stagger;
          nodeTimes.push(t);
          window.dgMotion.reveal(tl, h.group, t, { y: 10, duration: 0.35 });
          if (i > 0 && baseArrows[i - 1]) {
            gsap.set(baseArrows[i - 1], { opacity: 0 });
            tl.to(baseArrows[i - 1], { opacity: 1, duration: 0.28, ease: 'power2.out' }, t);
          }
          if (cfg.focusEach) {
            window.dgMotion.focus(tl, h.group, nodeGroups.slice(0, i + 1), t + 0.05, { dimOpacity: 0.55 });
          }
        }
        if (cfg.focusEach && typeof cfg.unfocusAt === 'number') {
          window.dgMotion.unfocus(tl, nodeGroups, cfg.unfocusAt);
        }
        if (flowPaths.length && typeof cfg.flowStart === 'number' && typeof cfg.flowEnd === 'number') {
          for (let j = 0; j < flowPaths.length; j++) {
            const arrowStart = Math.max(cfg.flowStart, (nodeTimes[j + 1] || cfg.flowStart) + 0.12);
            if (arrowStart < cfg.flowEnd) {
              window.dgMotion.flowDash(tl, flowPaths[j], arrowStart, cfg.flowEnd, {
                dash: '8 10',
                speed: 44,
                initialOpacity: 0,
                opacity: 0.85
              });
            }
          }
        }
      }

      return { svg: svg, items: handles, baseArrows: baseArrows, flowPaths: flowPaths };
    }
  };

  window.dgWidgets = dgWidgets;
})();
