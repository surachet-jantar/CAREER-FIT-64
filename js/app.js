/* LOGI-FIT 64 — app.js
   Boot, data loading, hash routing, language toggle (issue 02). */
(function () {
  'use strict';
  const { t, L } = window.LF;
  const esc = (s) => window.LF.Assessment.escapeHtml(String(s ?? ''));
  const DATA_FILES = ['questions', 'competencies', 'careers', 'profiles64', 'config', 'programs'];
  const RESULT_KEY = 'logifit_result';

  const state = { data: null, sharedResult: null, selectedProgram: null, wikiLastFrom: null };

  async function loadData() {
    const entries = await Promise.all(DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json`);
      if (!res.ok) throw new Error(`failed: ${name}`);
      return [name, await res.json()];
    }));
    return Object.fromEntries(entries);
  }

  /* ---------- program theme ---------- */

  function applyTheme(code) {
    const valid = ['LOG', 'ACC', 'MKT', 'IT', 'HOS', 'TRV'];
    const c = valid.includes(code) ? code : 'LOG';
    document.body.classList.remove(...valid.map(v => 'theme-' + v));
    document.body.classList.add('theme-' + c);
  }

  /* ---------- screens ---------- */

  function renderLanding(root) {
    const d = state.data;
    root.innerHTML = `
      <div class="grid grid-2" style="align-items:center;">
        <div>
          <div class="kicker">${t('hero_kicker')}</div>
          <h1 class="title">${t('hero_title')}</h1>
          <p class="muted" style="font-size:15.5px;line-height:1.75;max-width:560px;">${t('hero_copy')}</p>
          <div class="btn-row" style="margin-top:18px;">
            <button class="btn btn-primary" id="lf-start">▶ ${t('start_assess')}</button>
            <a class="btn btn-ghost" href="#docs" style="text-decoration:none;">📖 ${t('learn_more')}</a>
          </div>
        </div>
        <div class="card soft">
          <div class="stat-cards">
            <div class="stat"><strong>64</strong><span style="font-size:12.5px;">${t('stat_profiles')}</span>
              <div class="muted" style="font-size:11px;">${t('stat_profiles_sub')}</div></div>
            <div class="stat"><strong>50</strong><span style="font-size:12.5px;">${t('stat_careers')}</span>
              <div class="muted" style="font-size:11px;">${t('stat_careers_sub')}</div></div>
            <div class="stat"><strong>15</strong><span style="font-size:12.5px;">${t('stat_comps')}</span>
              <div class="muted" style="font-size:11px;">${t('stat_comps_sub')}</div></div>
          </div>
        </div>
      </div>
      <div class="disclaimer"><strong>${t('disclaimer_title')}:</strong> ${t('disclaimer_body')}</div>`;
    root.querySelector('#lf-start').onclick = () => { location.hash = '#picker'; route(); };
  }

  function renderProcessing(root) {
    root.innerHTML = `
      <div class="processing card">
        <div class="orbit"></div>
        <div class="kicker">CAREER-FIT</div>
        <h2 class="section-title" style="margin-top:8px;">${t('processing_title')}</h2>
        <p class="muted">${t('processing_copy')}</p>
      </div>`;
  }

  function renderProgramPicker(root) {
    const programs = state.data.programs || [];
    const grid = programs.map((p) => `
      <div class="picker-card" data-code="${p.code}">
        <div class="picker-name">${esc(L(p.name_th, p.name_en))}</div>
        <div class="picker-desc">${esc(L(p.desc_th, p.desc_en))}</div>
      </div>`).join('');

    root.innerHTML = `
      <div class="card stack" style="max-width:720px;margin:0 auto;">
        <div class="kicker">${t('picker_title')}</div>
        <p class="muted" style="font-size:14px;margin:4px 0 16px;">${t('picker_sub')}</p>
        <div class="picker-grid">${grid}</div>
        <div class="btn-row" style="margin-top:14px;">
          <button class="btn btn-ghost" id="lf-picker-home">← ${t('nav_home')}</button>
        </div>
      </div>`;

    root.querySelector('#lf-picker-home').onclick = () => { location.hash = '#home'; route(); };
    root.querySelectorAll('.picker-card').forEach((card) => {
      card.onclick = () => {
        // Changing program resets everything
        const prev = localStorage.getItem('logifit_program');
        if (prev !== card.dataset.code) {
          localStorage.removeItem('logifit_progress');
          localStorage.removeItem('logifit_result');
        }
        state.selectedProgram = card.dataset.code;
        localStorage.setItem('logifit_program', card.dataset.code);
        location.hash = '#assess';
        route();
      };
    });
  }

  function renderError(root, msgKey, err) {
    const detail = err && err.message ? `<pre style="text-align:left;font-size:11px;color:#b91c1c;white-space:pre-wrap;">${String(err.message).replace(/[<>&]/g, '')}</pre>` : '';
    root.innerHTML = `<div class="error-screen card"><h2>⚠️</h2><p class="muted">${t(msgKey)}</p>${detail}</div>`;
  }

  function renderResultScreen(root, result, opts) {
    window.LF.Result.render(root, state.data, result, opts || {});
    if (new URLSearchParams(location.search).has('cardpreview')) {
      window.LF.Share.showCardPreview(result, state.data);
    }
  }

  /* ---------- routing ---------- */

  function route() {
    const root = document.getElementById('screen');
    const hash = location.hash || '#home';

    if (hash.startsWith('#r=')) {
      readShared(root, hash);
      return;
    }
    // Preserve wikiLastFrom for wiki routes; reset otherwise
    if (!hash.startsWith('#docs') && hash !== '#result') {
      state.wikiLastFrom = null;
    }
    state.sharedResult = null;

    if (hash === '#assess') {
      // Ensure a program is selected before assessment
      if (!localStorage.getItem('logifit_program')) {
        renderProgramPicker(root);
        return;
      }
      state.selectedProgram = localStorage.getItem('logifit_program');
      applyTheme(state.selectedProgram);
      // Always go to nickname screen (handles fresh + resume)
      window.LF.Assessment.renderNickname(root, state.data);
      return;
    }
    if (hash === '#picker') {
      renderProgramPicker(root);
      return;
    }
    if (hash === '#result') {
      const stored = localStorage.getItem(RESULT_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          applyTheme(parsed.program || localStorage.getItem('logifit_program') || 'LOG');
          renderResultScreen(root, parsed, {});
          state.wikiLastFrom = 'result';
          return;
        }
        catch { /* fall through */ }
      }
      renderLanding(root);
      return;
    }
    if (hash.startsWith('#docs')) {
      applyTheme(localStorage.getItem('logifit_program') || 'LOG');
      const slug = hash.replace('#docs/', '').replace('#docs', '') || null;
      const fromResult = state.wikiLastFrom === 'result';
      window.LF.Wiki.render(root, state.data, slug, { fromResult });
      return;
    }
    // #home — show existing result shortcut if present
    applyTheme(localStorage.getItem('logifit_program') || 'LOG');
    renderLanding(root);
  }

  function renderLandingWithRetake(root) {
    renderLanding(root);
    const stored = localStorage.getItem(RESULT_KEY);
    if (!stored) return;
    try {
      const btnRow = root.querySelector('.btn-row');
      const b = document.createElement('button');
      b.className = 'btn btn-secondary';
      b.textContent = '📊 ' + t('best_fit') + ' — ' + Math.round(JSON.parse(stored).top10[0].fit) + '%';
      b.onclick = () => { location.hash = '#result'; route(); };
      btnRow.appendChild(b);
    } catch { /* ignore corrupt storage */ }
  }

  async function readShared(root, hash) {
    try {
      const decoded = await window.LF.Share.readShareLink(hash);
      const program = decoded.program || '';
      applyTheme(program);
      const result = Object.assign(decoded, {
        top10: window.LF.Scoring.rank(decoded, state.data, program),
      });
      state.sharedResult = result;
      renderResultScreen(root, result, { shared: true });
    } catch (e) {
      console.error('share-link error:', e);
      renderError(root, 'error_link', e);
    }
  }

  /* ---------- assessment completion ---------- */

  function finishAssessment(progressState) {
    const root = document.getElementById('screen');
    renderProcessing(root);
    const program = progressState.program || localStorage.getItem('logifit_program') || '';
    setTimeout(() => {
      const result = window.LF.Scoring.scoreAll(progressState.answers, state.data, program);
      result.nickname = progressState.nickname || '';
      result.program = program;
      localStorage.setItem(RESULT_KEY, JSON.stringify(result));
      window.LF.Assessment.clear();
      location.hash = '#result';
      route();
    }, 900); // brief processing beat
  }

  /* ---------- boot ---------- */

  function wireLangToggle() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('.lang-toggle button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === window.LF.getLang()));
      b.onclick = () => {
        window.LF.setLang(b.dataset.lang);
        wireLangToggle();
        route();
      };
    });
  }

  async function boot() {
    const root = document.getElementById('screen');
    wireLangToggle();
    document.documentElement.lang = window.LF.getLang();
    // Make logo / brand clickable → home
    const brand = document.querySelector('.brand');
    if (brand) brand.onclick = () => { location.hash = '#home'; route(); };
    try {
      state.data = await loadData();
    } catch {
      renderError(root, 'error_load');
      return;
    }
    console.log('%c CAREER-FIT 64 ', 'background:#0F766E;color:#fff;font-weight:bold;border-radius:4px;padding:2px 6px;', 'Created by Surachet Jantar');
    window.addEventListener('hashchange', route);
    route();
  }

  window.LF = window.LF || {};
  window.LF.App = { boot, route, finishAssessment };
  document.addEventListener('DOMContentLoaded', boot);
})();
