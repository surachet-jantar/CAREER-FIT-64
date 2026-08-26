/* LOGI-FIT 64 — result.js
   Renders Career DNA, radar, top-10 careers, skill gaps, learning path,
   roadmap — all values trace to scoring output (issue 05). */
(function () {
  'use strict';
  const { t, L } = window.LF;
  const esc = (s) => window.LF.Assessment.escapeHtml(String(s ?? ''));

  function programName(data, code) {
    if (!code || !data.programs) return '';
    const p = data.programs.find((x) => x.code === code);
    return p ? L(p.name_th, p.name_en) : '';
  }

  function compName(data, cid) {
    const c = data.competencies.find((x) => x.id === cid);
    return c ? L(c.name_th, c.name_en) : cid;
  }

  function fitBand(fit, config) {
    const b = config.fit_bands.find((b) => {
      const m = String(b.range).match(/(\d+)/);
      return m && fit >= Number(m[1]);
    });
    if (String(b?.range).startsWith('>=')) return b;
    // bands are ranges like "80-89.99" / "<50" — pick the last whose lower bound <= fit
    let found = config.fit_bands[config.fit_bands.length - 1];
    for (const band of config.fit_bands) {
      const m = String(band.range).match(/^(\d+)/);
      if (m && fit >= Number(m[1])) found = band;
    }
    return found;
  }

  function radarSVG(result, data, careerReq) {
    const comps = data.competencies;
    const n = comps.length, CX = 200, CY = 175, R = 130;
    const pt = (i, v) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${(CX + Math.cos(a) * R * v).toFixed(1)},${(CY + Math.sin(a) * R * v).toFixed(1)}`;
    };
    const rings = [0.25, 0.5, 0.75, 1]
      .map((r) => `<polygon points="${Array.from({ length: n }, (_, i) => pt(i, r)).join(' ')}" fill="none" stroke="#dbe4ee"/>`)
      .join('');
    const spokes = Array.from({ length: n }, (_, i) =>
      `<line x1="${CX}" y1="${CY}" x2="${pt(i, 1).split(',')[0]}" y2="${pt(i, 1).split(',')[1]}" stroke="#e7edf3"/>`).join('');
    const userPoly = `<polygon points="${comps.map((c, i) => pt(i, (result.compScores[c.id] ?? 0) / 5)).join(' ')}"
        fill="rgba(15,118,110,.16)" stroke="#0F766E" stroke-width="2.5"/>`;
    const reqPoly = careerReq
      ? `<polygon points="${comps.map((c, i) => pt(i, (careerReq[c.id]?.required ?? 0) / 5)).join(' ')}"
          fill="none" stroke="#2563EB" stroke-width="2" stroke-dasharray="5 4"/>` : '';
    const labels = comps.map((c, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = CX + Math.cos(a) * (R + 22), y = CY + Math.sin(a) * (R + 18);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="9.5" fill="#64748b"
        text-anchor="middle" dominant-baseline="middle">${esc(compName(data, c.id))}</text>`;
    }).join('');
    return `<svg viewBox="0 0 400 350" role="img" aria-label="competency radar">
      ${rings}${spokes}${reqPoly}${userPoly}${labels}</svg>`;
  }

  function render(root, data, result, opts = {}) {
    const profileId = result.profileCode + '-' + result.modeDominant;
    const profile = data.profiles64.find((p) => p.id === profileId);
    const top = result.top10[0];
    const topCareer = top && data.careers.find((c) => c.id === top.id);
    const band = top ? fitBand(top.fit, data.config) : null;

    root.innerHTML = `
      <div class="print-only">
        <div class="ph-brand">CAREER-FIT 64 — ${t('brand_sub')}</div>
        ${result.program ? `<div class="ph-meta">${t('program_label')}: ${esc(programName(data, result.program))}</div>` : ''}
        <div class="ph-meta">
          ${esc(result.profileCode)}-${esc(result.modeDominant)}
          ${profile ? '· ' + esc(L(profile.name_th, profile.name_en)) : ''}
          ${result.nickname ? '· ' + esc(result.nickname) : ''}
          ${result.createdAt ? '· ' + esc(result.createdAt).slice(0, 10) : ''}
          <br>${esc(location.origin + location.pathname)}
        </div>
      </div>
      ${opts.shared ? `<div class="badge-note no-print" style="margin-bottom:14px;">🔗 ${t('shared_view_note')}</div>` : ''}
      <div class="grid grid-2">
        <div class="dna-card">
          <div style="opacity:.75;font-size:13px;">${t('result_dna')}</div>
          ${result.program ? `<div style="opacity:.85;font-size:13px;margin-top:4px;">${t('program_label')}: ${esc(programName(data, result.program))}</div>` : ''}
          <div class="dna-code">${esc(result.profileCode)}-${esc(result.modeDominant)}</div>
          <div style="font-size:20px;font-weight:800;margin-top:6px;">
            ${profile ? esc(L(profile.name_th, profile.name_en)) : ''}</div>
          ${result.nickname ? `<div style="opacity:.85;font-size:14px;margin-top:8px;">👤 ${esc(result.nickname)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${topCareer ? esc(L(topCareer.cluster.th, topCareer.cluster.en)) : ''}
          </div>
        </div>
        <div class="card" style="text-align:center;">
          <div class="muted" style="font-size:13px;font-weight:700;">${t('best_fit')}</div>
          <div class="fit-circle" style="background:conic-gradient(var(--teal) 0 ${top ? top.fit : 0}%, #e5edf3 ${top ? top.fit : 0}% 100%);margin-top:12px;">
            <div><strong>${top ? Math.round(top.fit) : '-'}%</strong></div>
          </div>
          <div style="font-weight:800;margin-top:12px;">${topCareer ? esc(L(topCareer.name_th, topCareer.name_en)) : '-'}</div>
          ${band ? `<span class="chip" style="margin-top:8px;">${esc(L(band.label_th, band.label_en))}</span>` : ''}
        </div>
      </div>

      <div class="card stack" style="margin-top:14px;">
        <h2 class="section-title">${t('radar_title')}</h2>
        <div class="radar-wrap">${radarSVG(result, data, topCareer?.requirements)}</div>
        <div style="display:flex;gap:16px;justify-content:center;font-size:12.5px;" class="muted">
          <span>🟢 ${t('radar_legend_user')}</span><span>🔵 ─ ─ ${t('radar_legend_req')}</span>
        </div>
      </div>

      <div class="card stack" style="margin-top:14px;">
        <div><h2 class="section-title">${t('top_careers_title')}</h2>
          <p class="muted" style="font-size:13px;margin:2px 0 0;">${t('top_careers_sub')}</p></div>
        <div class="career-list">
          ${result.top10.map((r, i) => careerRow(r, i, data)).join('')}
        </div>
      </div>

      ${top && top.gaps ? gapSection(top, data) : ''}
      ${topCareer ? learningSection(top, data) : ''}
      ${topCareer ? roadmapSection(topCareer) : ''}

      <div class="share-btns no-print" style="margin-top:18px;">
        <button class="btn btn-primary" id="lf-share-link">🔗 ${t('share_link')}</button>
        <button class="btn btn-secondary" id="lf-share-card">🖼 ${t('share_card')}</button>
        <button class="btn btn-ghost" id="lf-share-pdf">🖨 ${t('share_pdf')}</button>
        <button class="btn btn-ghost" id="lf-home">🏠 ${t('nav_home')}</button>
        ${opts.shared ? '' : `<button class="btn btn-ghost" id="lf-retake">↻ ${t('retake')}</button>`}
        <a class="btn btn-ghost" href="#docs" style="text-decoration:none;">📖 ${t('learn_more')}</a>
      </div>

      <div class="disclaimer"><strong>${t('disclaimer_title')}:</strong> ${t('disclaimer_body')}</div>
    `;

    // interactions
    root.querySelectorAll('.career-row').forEach((row) => {
      row.onclick = () => row.classList.toggle('expanded');
    });
    root.querySelector('#lf-share-link').onclick = () => window.LF.Share.copyLink(result, result.nickname);
    root.querySelector('#lf-share-card').onclick = () => window.LF.Share.downloadCard(result, data);
    root.querySelector('#lf-share-pdf').onclick = () => window.print();
    root.querySelector('#lf-home').onclick = () => { location.hash = '#home'; window.LF.App.route(); };
    const retake = root.querySelector('#lf-retake');
    if (retake) retake.onclick = () => {
      window.LF.Assessment.clear();
      localStorage.removeItem('logifit_result');
      localStorage.removeItem('logifit_program');
      location.hash = '#picker';
      window.LF.App.route();
    };
  }

  function careerRow(r, i, data) {
    const career = data.careers.find((c) => c.id === r.id);
    if (!career) return '';
    const parts = r.parts;
    return `
      <div class="career-row" data-id="${career.id}">
        <div class="rank">${i + 1}</div>
        <div>
          <strong>${esc(L(career.name_th, career.name_en))}</strong>
          <div class="muted" style="font-size:12px;">${esc(L(career.cluster.th, career.cluster.en))}</div>
          <div class="progress" style="margin-top:7px;"><span style="width:${r.fit}%"></span></div>
        </div>
        <div class="score">${Math.round(r.fit)}%</div>
        <div class="career-detail">
          ${parts ? `
            <div class="muted" style="font-size:12.5px;font-weight:700;">${t('why_title')}</div>
            <table class="legend">
              <tr><td>${t('comp_p')}</td><td><b>${parts.p}%</b></td></tr>
              <tr><td>${t('comp_c')}</td><td><b>${parts.c}%</b></td></tr>
              <tr><td>${t('comp_i')}</td><td><b>${parts.i}%</b></td></tr>
              <tr><td>${t('comp_w')}</td><td><b>${parts.w}%</b></td></tr>
            </table>` : ''}
          ${career.description_th ? `<p class="muted" style="font-size:13px;line-height:1.6;">${esc(L(career.description_th, career.description_en))}</p>` : ''}
          ${career.entry_education ? `<div class="muted" style="font-size:12.5px;"><b>${t('entry_edu')}:</b> ${esc(career.entry_education)}</div>` : ''}
        </div>
      </div>`;
  }

  function gapSection(top, data) {
    const rows = top.gaps.slice(0, 8).map((g) => {
      const pctCur = (g.current / 5) * 100, pctNeed = (g.required / 5) * 100;
      return `
        <div class="gap-row">
          <strong style="font-size:13.5px;">${esc(compName(data, g.cid))}</strong>
          <div class="gap-bar">
            <span class="current" style="width:${pctCur}%"></span>
            <span class="need" style="left:${pctNeed}%"></span>
          </div>
          <span class="gap-label gap-${g.band}">${t('gap_' + g.band)} · ${g.current.toFixed(1)}/${g.required}</span>
        </div>`;
    }).join('');
    return `
      <div class="card stack" style="margin-top:14px;">
        <div><h2 class="section-title">${t('skillgap_title')}</h2>
          <p class="muted" style="font-size:13px;margin:2px 0 0;">${t('skillgap_sub')}</p></div>
        ${rows}
      </div>`;
  }

  function learningSection(top, data) {
    const priority = (top.gaps || []).filter((g) => g.band === 'priority' || g.band === 'development').slice(0, 3);
    if (!priority.length) return '';
    const items = priority.map((g) => {
      const c = data.competencies.find((x) => x.id === g.cid);
      if (!c || !c.learning) return '';
      return `
        <div class="node" style="min-width:230px;">
          <strong style="font-size:13.5px;">${esc(L(c.name_th, c.name_en))}</strong>
          <p class="muted" style="font-size:12px;margin:6px 0 0;">🌱 ${esc(L(c.learning.beginner, c.learning.beginner_en))}</p>
          <p class="muted" style="font-size:12px;margin:4px 0 0;">🌿 ${esc(c.learning.intermediate)}</p>
          <p class="muted" style="font-size:12px;margin:4px 0 0;">🌳 ${esc(c.learning.advanced)}</p>
        </div>`;
    }).join('');
    if (!items) return '';
    return `
      <div class="card stack" style="margin-top:14px;">
        <h2 class="section-title">${t('learning_title')}</h2>
        <div class="path">${items}</div>
      </div>`;
  }

  function roadmapSection(career) {
    if (!career.roadmap || !career.roadmap.length) return '';
    const en = career.roadmap_en || [];
    const nodes = career.roadmap
      .map((s, i) => `${i ? '<div class="arrow">→</div>' : ''}
        <div class="node"><strong style="font-size:13px;">${esc(L(s, en[i]))}</strong></div>`)
      .join('');
    return `
      <div class="card stack" style="margin-top:14px;">
        <h2 class="section-title">${t('roadmap_title')}</h2>
        <div class="path">${nodes}</div>
      </div>`;
  }

  window.LF = window.LF || {};
  window.LF.Result = { render };
})();
