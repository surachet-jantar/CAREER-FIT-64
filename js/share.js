/* LOGI-FIT 64 — share.js
   Share Link (URL fragment) + Result Card PNG (PRD D2, D7; ADR-0001). */
(function () {
  'use strict';

  /* ---------- encode / decode ---------- */

  function b64urlEncode(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return bytes;
    try {
      const cs = new CompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(cs);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      return bytes; // engine without deflate-raw → store uncompressed
    }
  }
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* Minimal payload: only measured vectors. Rankings, fit %, and skill gaps
     are recomputed client-side from data/*.json on every view (single source
     of truth — nothing derived is stored). */
  function packResult(result, nickname) {
    const compOrder = Array.from({ length: 15 }, (_, i) => 'C' + String(i + 1).padStart(2, '0'));
    return {
      v: 3,
      n: nickname || undefined,
      pr: result.program || undefined,
      p: result.profileCode,
      m: result.modeDominant,
      x: ['EI', 'SN', 'TF', 'JP'].map((k) => result.axes?.[k]?.pct ?? 50),
      w: ['S', 'O', 'C', 'A'].map((k) => Math.round((result.modeScores[k] ?? 0) * 100)),
      c: compOrder.map((cid) => Math.round((result.compScores[cid] ?? 0) * 100)),
      i: ['D', 'P', 'T', 'O', 'L'].map((k) => result.interestScores[k] ?? 0),
      d: result.createdAt ? result.createdAt.slice(0, 10) : undefined,
    };
  }
  function unpackResult(obj) {
    const compScores = {};
    obj.c.forEach((v, idx) => { compScores['C' + String(idx + 1).padStart(2, '0')] = v / 100; });
    const modeScores = {};
    ['S', 'O', 'C', 'A'].forEach((k, idx) => { modeScores[k] = (obj.w?.[idx] ?? 0) / 100; });
    const interestScores = {};
    ['D', 'P', 'T', 'O', 'L'].forEach((k, idx) => { interestScores[k] = obj.i?.[idx] ?? 0; });
    // Rebuild personality axes from leading-pole percentages
    const LEAD = ['E', 'S', 'T', 'J'];
    const OPP = { E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' };
    const axes = {};
    ['EI', 'SN', 'TF', 'JP'].forEach((k, idx) => {
      const pct = obj.x?.[idx] ?? 50;
      axes[k] = { pct, letter: pct >= 50 ? LEAD[idx] : OPP[LEAD[idx]] };
    });
    return {
      shared: true,
      nickname: obj.n || '',
      program: obj.pr || '',
      profileCode: obj.p,
      modeDominant: obj.m || 'S',
      axes,
      modeScores,
      compScores,
      interestScores,
      createdAt: obj.d,
    };
  }

  /* Payload layout: [flag][data] where flag 1 = deflate-raw, 0 = raw UTF-8.
     Self-describing so decode never has to guess the encoding. */
  async function buildShareLink(result, nickname) {
    const json = JSON.stringify(packResult(result, nickname));
    const bytes = new TextEncoder().encode(json);
    let payload;
    try {
      const packed = await deflate(bytes);
      payload = packed !== bytes ? new Uint8Array([1, ...packed]) : new Uint8Array([0, ...bytes]);
    } catch {
      payload = new Uint8Array([0, ...bytes]);
    }
    return location.origin + location.pathname + '#r=' + b64urlEncode(payload);
  }

  async function readShareLink(hash) {
    if (!hash || !hash.startsWith('#r=')) return null;
    try {
      const raw = b64urlDecode(hash.slice(3));
      const flag = raw[0];
      const body = raw.slice(1);
      const jsonBytes = flag === 1 ? await inflate(body) : body;
      return unpackResult(JSON.parse(new TextDecoder().decode(jsonBytes)));
    } catch {
      throw new Error('invalid-share-link');
    }
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- actions ---------- */
  async function copyLink(result, nickname) {
    const url = await buildShareLink(result, nickname);
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(window.LF.t('link_copied'));
  }

  function fitBandOf(fit, config) {
    let found = config.fit_bands[config.fit_bands.length - 1];
    for (const band of config.fit_bands) {
      const m = String(band.range).match(/^(\d+)/);
      if (m && fit >= Number(m[1])) found = band;
    }
    return found;
  }

  function truncate(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
    return text + '…';
  }

  function bar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (pct > 0.02) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(h, w * pct), h, h / 2); ctx.fill();
    }
  }

  /* --- PNG tEXt metadata (invisible author credit) --- */
  const _crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function _crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = _crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function _pngChunk(type, data) {
    const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, data.length);
    const typeBytes = new TextEncoder().encode(type);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes); crcInput.set(data, typeBytes.length);
    const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, _crc32(crcInput));
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    chunk.set(len, 0); chunk.set(typeBytes, 4); chunk.set(data, 8); chunk.set(crc, 8 + data.length);
    return chunk;
  }
  function injectPNGAuthor(blob, author) {
    return blob.arrayBuffer().then((buf) => {
      const src = new Uint8Array(buf);
      const text = new TextEncoder().encode('Author\0' + author);
      const chunk = _pngChunk('tEXt', text);
      let pos = 8; // skip PNG signature
      while (pos < src.length) {
        const len = new DataView(src.buffer, src.byteOffset + pos, 4).getUint32(0);
        const type = String.fromCharCode(src[pos+4], src[pos+5], src[pos+6], src[pos+7]);
        if (type === 'IDAT') break;
        pos += 12 + len;
      }
      const out = new Uint8Array(src.length + chunk.length);
      out.set(src.subarray(0, pos), 0);
      out.set(chunk, pos);
      out.set(src.subarray(pos), pos + chunk.length);
      return new Blob([out], { type: 'image/png' });
    });
  }

  function downloadCard(result, data) {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    drawCard(ctx, W, H, result, data);
    canvas.toBlob((blob) => {
      injectPNGAuthor(blob, 'Surachet Jantar').then((signed) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(signed);
        a.download = `logifit64-${result.profileCode}${result.modeDominant}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(window.LF.t('card_saved'));
      });
    }, 'image/png');
  }

  function drawCard(ctx, W, H, result, data) {
    const { t, L } = window.LF;
    const TH = '"Noto Sans Thai", Inter, sans-serif';

    // ---------- program colors ----------
    const PROG_COLORS = {
      LOG: { primary: '#0F766E', mid: '#164E63' },
      ACC: { primary: '#2563EB', mid: '#1E3A8A' },
      MKT: { primary: '#DB2777', mid: '#9D174D' },
      IT:  { primary: '#4F46E5', mid: '#3730A3' },
      HOS: { primary: '#D97706', mid: '#92400E' },
      TRV: { primary: '#059669', mid: '#065F46' },
    };
    const pc = PROG_COLORS[result.program] || PROG_COLORS.LOG;

    // ---------- background ----------
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, pc.primary); grad.addColorStop(.5, pc.mid); grad.addColorStop(1, '#1E3A8A');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    ctx.beginPath(); ctx.arc(W - 40, 300, 230, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(60, 1100, 180, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(W - 90, 1700, 160, 0, 7); ctx.fill();

    const sectionTitle = (txt, x, y) => {
      ctx.fillStyle = '#5EEAD4'; ctx.font = '800 21px Inter, sans-serif';
      ctx.fillText(txt.toUpperCase(), x, y);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(x, y + 10, 950, 2);
    };

    // ---------- 1. header ----------
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    roundRect(ctx, 56, 48, 68, 68, 18); ctx.fill();
    ctx.fillStyle = pc.primary; ctx.font = '900 31px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CF', 90, 84);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff'; ctx.font = '800 35px Inter, sans-serif';
    ctx.fillText('CAREER-FIT 64', 144, 82);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 19px ' + TH;
    ctx.fillText(t('brand_sub'), 146, 112);
    // Program subtitle
    const progName = (() => {
      if (!result.program || !data.programs) return '';
      const p = data.programs.find((x) => x.code === result.program);
      return p ? L(p.name_th, p.name_en) : '';
    })();
    if (progName) {
      ctx.fillStyle = 'rgba(94,234,212,.85)'; ctx.font = '700 17px ' + TH;
      ctx.fillText(t('program_label') + ': ' + progName, 146, 136);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 19px ' + TH;
    ctx.fillText(result.createdAt || new Date().toISOString().slice(0, 10), W - 64, 92);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(56, 140); ctx.lineTo(W - 56, 140); ctx.stroke();

    /* Wraps on spaces when available; falls back to character-level breaks
       for spaceless scripts like Thai (fixes overflow into the score). */
    const wrapText = (txt, maxW) => {
      const lines = [];
      let line = '';
      for (const word of String(txt).split(' ')) {
        let w = word;
        while (ctx.measureText(w).width > maxW) {          // word longer than a line → char-split
          if (line) { lines.push(line); line = ''; }
          let part = '';
          for (const ch of w) {
            if (ctx.measureText(part + ch).width > maxW) break;
            part += ch;
          }
          if (!part) break;
          lines.push(part);
          w = w.slice(part.length);
        }
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines;
    };
    const panel = (x, y, w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      roundRect(ctx, x, y, w, h, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(94,234,212,.35)'; ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, h, 20); ctx.stroke();
      ctx.lineWidth = 1;
    };

    // ===== ROW 1 · 2 col : DNA | Best fit =====
    const R1Y = 170, R1H = 268;
    panel(56, R1Y, 472, R1H);
    panel(544, R1Y, 480, R1H);

    // left card — Career DNA
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '700 17px ' + TH;
    ctx.fillText(t('result_dna').toUpperCase(), 82, R1Y + 40);
    ctx.fillStyle = '#fff'; ctx.font = '900 68px Inter, sans-serif';
    ctx.fillText(`${result.profileCode}-${result.modeDominant}`, 78, R1Y + 116);
    const profileId = result.profileCode + '-' + result.modeDominant;
    const profile = data.profiles64.find((p) => p.id === profileId);
    ctx.font = '700 25px ' + TH;
    const nameLines = wrapText(profile ? L(profile.name_th, profile.name_en) : '', 410).slice(0, 2);
    nameLines.forEach((ln, i) => ctx.fillText(ln, 82, R1Y + 158 + i * 34));
    if (result.nickname) {
      ctx.font = '600 19px ' + TH;
      const nw = ctx.measureText('👤 ' + result.nickname).width + 36;
      ctx.fillStyle = 'rgba(94,234,212,.16)';
      roundRect(ctx, 80, R1Y + 214, nw, 38, 19); ctx.fill();
      ctx.strokeStyle = 'rgba(94,234,212,.45)';
      roundRect(ctx, 80, R1Y + 214, nw, 38, 19); ctx.stroke();
      ctx.fillStyle = '#99F6E4';
      ctx.fillText('👤 ' + result.nickname, 98, R1Y + 240);
    }

    // right card — Best fit
    const top = result.top10[0];
    const topCareer0 = data.careers.find((c) => c.id === top?.id);
    const band = top ? fitBandOf(top.fit, data.config) : null;
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '700 17px ' + TH;
    ctx.fillText(t('best_fit').toUpperCase(), 570, R1Y + 40);
    ctx.fillStyle = '#fff'; ctx.font = '800 27px ' + TH;
    wrapText(topCareer0 ? L(topCareer0.name_th, topCareer0.name_en) : '-', 268).slice(0, 2)
      .forEach((ln, i) => ctx.fillText(ln, 570, R1Y + 84 + i * 36));
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5EEAD4'; ctx.font = '900 62px Inter, sans-serif';
    ctx.fillText(Math.round(top?.fit ?? 0) + '%', 996, R1Y + 116);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 17px ' + TH;
    if (band) ctx.fillText(L(band.label_th, band.label_en), 996, R1Y + 148);
    ctx.textAlign = 'left';
    bar(ctx, 570, R1Y + 218, 400, 12, (top?.fit ?? 0) / 100, '#5EEAD4');

    // ===== ROW 2 · 1 col : top-5 careers =====
    sectionTitle(t('top_careers_title'), 66, 496);
    result.top10.slice(0, 5).forEach((r, i) => {
      const career = data.careers.find((c) => c.id === r.id);
      if (!career) return;
      const y = 540 + i * 58;
      ctx.fillStyle = i === 0 ? '#5EEAD4' : 'rgba(255,255,255,.85)';
      roundRect(ctx, 64, y - 22, 36, 36, 10); ctx.fill();
      ctx.fillStyle = i === 0 ? pc.primary : '#fff';
      ctx.font = '900 19px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 82, y - 3);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff'; ctx.font = '700 23px ' + TH;
      ctx.fillText(truncate(ctx, L(career.name_th, career.name_en), 620), 116, y + 4);
      bar(ctx, 116, y + 13, 620, 9, r.fit / 100, '#5EEAD4');
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '900 25px Inter, sans-serif';
      ctx.fillText(Math.round(r.fit) + '%', W - 84, y + 6);
      ctx.textAlign = 'left';
    });

    // ===== ROW 3 · 2 col : radar | personality =====
    const R3Y = 880, R3H = 396;
    panel(56, R3Y, 472, R3H);
    panel(544, R3Y, 480, R3H);
    ctx.fillStyle = '#5EEAD4'; ctx.font = '800 18px Inter, sans-serif';
    ctx.fillText(t('radar_title').toUpperCase(), 82, R3Y + 38);
    drawRadar(ctx, result, data, 292, R3Y + 202, 118, topCareer0);
    ctx.fillStyle = '#5EEAD4'; ctx.beginPath(); ctx.arc(180, R3Y + 356, 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '500 15px ' + TH;
    ctx.fillText(t('radar_legend_user'), 194, R3Y + 361);
    ctx.fillStyle = '#93C5FD'; ctx.beginPath(); ctx.arc(396, R3Y + 356, 6, 0, 7); ctx.fill();
    ctx.fillText(t('radar_legend_req'), 410, R3Y + 361);

    ctx.fillStyle = '#5EEAD4'; ctx.font = '800 18px Inter, sans-serif';
    ctx.fillText('PERSONALITY', 570, R3Y + 38);
    const AXES = [['EI', 'E', 'I'], ['SN', 'S', 'N'], ['TF', 'T', 'F'], ['JP', 'J', 'P']];
    AXES.forEach(([key, a, b], i) => {
      const y = R3Y + 84 + i * 76;
      const pct = result.axes?.[key]?.pct ?? 50;
      const dom = pct >= 50 ? a : b;
      ctx.fillStyle = '#fff'; ctx.font = '800 24px Inter, sans-serif';
      ctx.fillText(dom, 570, y + 16);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 15px Inter, sans-serif';
      ctx.fillText(Math.round(pct >= 50 ? pct : 100 - pct) + '%', 612, y + 15);
      bar(ctx, 656, y, 250, 12, pct / 100, '#5EEAD4');
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '700 20px Inter, sans-serif';
      ctx.fillText(pct >= 50 ? b : a, 948, y + 16);
    });

    // ===== ROW 4 · 2 col : interest | skill gaps =====
    const R4Y = 1300, R4H = 306;
    panel(56, R4Y, 472, R4H);
    panel(544, R4Y, 480, R4H);
    ctx.fillStyle = '#5EEAD4'; ctx.font = '800 18px Inter, sans-serif';
    ctx.fillText('CAREER INTEREST', 82, R4Y + 38);
    const DIMS = [['D', 'Data'], ['P', 'People'], ['T', 'Tech'], ['O', 'Ops'], ['L', 'Lead']];
    DIMS.forEach(([k, label], i) => {
      const y = R4Y + 78 + i * 44;
      const v = result.interestScores?.[k] ?? 0;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 17px ' + TH;
      ctx.fillText(label, 82, y + 12);
      bar(ctx, 190, y, 230, 11, v / 5, '#93C5FD');
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '700 16px Inter, sans-serif';
      ctx.fillText(v.toFixed(0), 500, y + 12);
      ctx.textAlign = 'left';
    });

    ctx.fillStyle = '#5EEAD4'; ctx.font = '800 18px Inter, sans-serif';
    ctx.fillText(t('skillgap_title').toUpperCase(), 570, R4Y + 38);
    const BAND_COLOR = { strength: '#6EE7B7', nearly_ready: '#FCD34D', development: '#FDBA74', priority: '#FCA5A5' };
    const gapsAll = (top?.gaps || []).slice().sort((a, b) => b.gap - a.gap);
    const gaps = gapsAll.filter((g) => g.band !== 'strength').slice(0, 3);
    if (!gaps.length) {
      ctx.fillStyle = '#86EFAC'; ctx.font = '600 19px ' + TH;
      ctx.fillText('✓ ' + t('gap_strength'), 570, R4Y + 96);
    } else {
      gaps.forEach((g, i) => {
        const y = R4Y + 88 + i * 68;
        const c = data.competencies.find((x) => x.id === g.cid);
        ctx.fillStyle = '#fff'; ctx.font = '600 20px ' + TH;
        ctx.fillText(truncate(ctx, c ? L(c.name_th, c.name_en) : g.cid, 240), 570, y);
        ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = '500 16px Inter, sans-serif';
        ctx.fillText(`${g.current.toFixed(1)} → ${g.required.toFixed(1)}`, 570, y + 26);
        const bw = 168;
        ctx.fillStyle = BAND_COLOR[g.band] ?? '#FCA5A5';
        roundRect(ctx, 1024 - 26 - bw, y - 20, bw, 30, 15); ctx.fill();
        ctx.fillStyle = '#134E4A'; ctx.font = '800 14px ' + TH; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t('gap_' + g.band), 1024 - 26 - bw / 2, y - 4);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      });
    }

    // ===== roadmap strip with guide arrows (full width) =====
    sectionTitle(t('roadmap_title'), 66, 1668);
    if (topCareer0?.roadmap?.length) {
      const en = topCareer0.roadmap_en || [];
      const stages = topCareer0.roadmap.map((s, i) => ({ txt: L(s, en[i]), arrow: i < topCareer0.roadmap.length - 1 }));
      let fs = 20;
      ctx.font = `600 ${fs}px ` + TH;
      let total = stages.reduce((a, p) => a + ctx.measureText(p.txt).width + 34, 0);
      if (total > W - 132) { fs = Math.max(14, Math.floor((fs * (W - 132)) / total)); ctx.font = `600 ${fs}px ` + TH; }
      let rx = 66;
      stages.forEach((p) => {
        if (rx > W - 70) return;
        const txt = truncate(ctx, p.txt, 240);
        ctx.fillStyle = '#fff'; ctx.fillText(txt, rx, 1704);
        rx += ctx.measureText(txt).width + 10;
        if (p.arrow) {
          ctx.fillStyle = '#5EEAD4'; ctx.font = `800 ${fs + 3}px Inter, sans-serif`;
          ctx.fillText('→', rx, 1704);
          rx += ctx.measureText('→').width + 10;
          ctx.font = `600 ${fs}px ` + TH;
        }
      });
    }

    // ---------- footer ----------
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(56, H - 78); ctx.lineTo(W - 56, H - 78); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '500 16px ' + TH;
    ctx.fillText(location.origin + location.pathname, W / 2, H - 46);
    ctx.font = '500 12.5px ' + TH;
    ctx.fillText(t('disclaimer_body').slice(0, 118) + '…', W / 2, H - 20);
    ctx.textAlign = 'left';
  }

  /* Preview overlay for ?cardpreview — renders the share card on screen. */
  function showCardPreview(result, data) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.85);z-index:999;display:grid;place-items:center;cursor:zoom-out;padding:12px;';
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    canvas.style.cssText = 'max-width:min(540px,96vw);max-height:96vh;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.5);';
    drawCard(canvas.getContext('2d'), 1080, 1920, result, data);
    overlay.appendChild(canvas);
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  function drawRadar(ctx, result, data, cx, cy, R, career) {
    const { L } = window.LF;
    const comps = data.competencies;
    const n = comps.length;
    const pt = (i, v) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
    };
    // rings
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, ring); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // spokes
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, 1);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    }
    // requirement polygon (blue dashed) — matches web/PDF overlay
    if (career?.requirements) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const c = comps[i % n];
        const [x, y] = pt(i % n, (career.requirements[c.id]?.required ?? 0) / 5);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // user polygon
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const c = comps[i % n];
      const [x, y] = pt(i % n, (result.compScores[c.id] ?? 0) / 5);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(94,234,212,.28)'; ctx.fill();
    ctx.strokeStyle = '#5EEAD4'; ctx.lineWidth = 2.5; ctx.stroke();
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, (result.compScores[comps[i].id] ?? 0) / 5);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7);
      ctx.fillStyle = '#5EEAD4'; ctx.fill();
    }
    // labels around the perimeter
    ctx.font = '500 10.5px "Noto Sans Thai", Inter, sans-serif';
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = cx + Math.cos(a) * (R + 12), ly = cy + Math.sin(a) * (R + 12);
      const c = comps[i];
      const name = truncate(ctx, L(c.name_th, c.name_en), 78);
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.textAlign = Math.abs(Math.cos(a)) < 0.35 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
      ctx.textBaseline = Math.sin(a) < -0.7 ? 'alphabetic' : (Math.sin(a) > 0.7 ? 'hanging' : 'middle');
      ctx.fillText(name, lx, ly);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.LF = window.LF || {};
  window.LF.Share = { buildShareLink, readShareLink, copyLink, downloadCard, showCardPreview, toast };
})();
