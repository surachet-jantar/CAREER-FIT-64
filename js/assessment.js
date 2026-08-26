/* LOGI-FIT 64 — assessment.js
   75-question flow with localStorage auto-save/resume (PRD D4, D9). */
(function () {
  'use strict';
  const { t, L } = window.LF;
  const KEY = 'logifit_progress';

  const SECTIONS = [
    { key: 'personality', label: 'sec_personality' },
    { key: 'career_mode', label: 'sec_career_mode' },
    { key: 'competency', label: 'sec_competency' },
    { key: 'interest', label: 'sec_interest' },
    { key: 'program_specific', label: 'sec_program_specific' },
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  }
  function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
  function clear() { localStorage.removeItem(KEY); }

  function firstUnanswered(state, questions) {
    return questions.findIndex((q) => state.answers[q.id] == null);
  }

  /* ---------- nickname screen ---------- */
  function renderNickname(root, data, opts = {}) {
    const resumeState = load();
    const hasProgress = !opts.forceNew && resumeState && Object.keys(resumeState.answers || {}).length > 0;
    const allDone = hasProgress && firstUnanswered(resumeState, data.questions) === -1;

    root.innerHTML = `
      <div class="card stack" style="max-width:560px;margin:0 auto;">
        ${hasProgress ? `<div class="badge-note">${t('resume_found')}</div>` : ''}
        <div>
          <div class="kicker">${t('nickname_title')}</div>
          <h2 class="section-title" style="margin-top:6px;">${t('nickname_label')}</h2>
          <p class="muted" style="font-size:13.5px;margin:6px 0 14px;">${t('nickname_hint')}</p>
          <input id="lf-nickname" class="nickname-input" maxlength="30"
                 value="${hasProgress && resumeState.nickname ? escapeHtml(resumeState.nickname) : ''}">
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" id="lf-nick-home">← ${t('nav_home')}</button>
          ${hasProgress ? '<button class="btn btn-secondary" id="lf-resume">' + t('resume_continue') + '</button>' : ''}
          <button class="btn btn-primary" id="lf-begin">${t(hasProgress ? 'resume_restart' : 'start_assess')}</button>
        </div>
      </div>`;

    root.querySelector('#lf-nick-home').onclick = () => { location.hash = '#home'; window.LF.App.route(); };
    const nick = () => root.querySelector('#lf-nickname').value.trim();
    if (hasProgress) {
      root.querySelector('#lf-resume').onclick = () => {
        resumeState.nickname = nick();
        resumeState.program = resumeState.program || localStorage.getItem('logifit_program') || '';
        save(resumeState);
        if (allDone) {
          // All questions answered — go directly to finish/scoring
          window.LF.App.finishAssessment(resumeState);
        } else {
          renderQuestion(root, data, firstUnanswered(resumeState, data.questions));
        }
      };
    }
    root.querySelector('#lf-begin').onclick = () => {
      const prog = localStorage.getItem('logifit_program') || '';
      const fresh = { nickname: nick(), answers: {}, startedAt: Date.now(), program: prog };
      save(fresh);
      renderQuestion(root, data, 0);
    };
  }

  /* ---------- question screen ---------- */
  function renderQuestion(root, data, index) {
    const state = load() || { answers: {}, nickname: '' };
    const qs = (data && data.questions) || [];
    if (!qs.length) {
      root.innerHTML = '<div class="error-screen card"><p class="muted">' + t('error_load') + '</p></div>';
      return;
    }
    index = Math.max(0, Math.min(index, qs.length - 1));
    const q = qs[index];
    if (!q) return;
    const secIdx = SECTIONS.findIndex((s) => s.key === q.section);
    const answeredCount = Object.keys(state.answers).length;
    const current = state.answers[q.id];

    root.innerHTML = `
      <div class="assess-wrap">
        <aside class="side no-print">
          <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">
            ${t('q_of', { n: index + 1, total: qs.length })}
          </div>
          <div class="progress" style="margin:10px 0 14px;"><span style="width:${(answeredCount / qs.length) * 100}%"></span></div>
          ${SECTIONS.map((s, i) => `
            <div class="step ${i === secIdx ? 'active' : i < secIdx ? 'done' : ''}">
              <span class="dot">${i < secIdx ? '✓' : i + 1}</span><span>${t(s.label)}</span>
            </div>`).join('')}
          <div class="muted" style="font-size:11.5px;margin-top:10px;">💾 ${t('autosave_note')}</div>
        </aside>
        <div class="card">
          <div class="kicker">${t(SECTIONS[secIdx].label)}</div>
          <div class="question">${L(q.text_th, q.text_en)}</div>
          <div class="scale" role="radiogroup">
            ${[1, 2, 3, 4, 5].map((v) => `
              <button type="button" data-v="${v}" class="${current === v ? 'selected' : ''}">
                ${v}<small>${t('scale' + v)}</small>
              </button>`).join('')}
          </div>
          <div class="q-footer">
            <button class="btn btn-ghost" id="lf-prev" ${index === 0 ? 'disabled' : ''}>← ${t('back')}</button>
            ${index === qs.length - 1
              ? `<button class="btn btn-primary" id="lf-finish" ${answeredCount < qs.length ? 'disabled' : ''}>${t('finish')}</button>`
              : `<button class="btn btn-primary" id="lf-next" ${current == null ? 'disabled' : ''}>${t('next')} →</button>`}
          </div>
        </div>
      </div>`;

    root.querySelectorAll('.scale button').forEach((b) => {
      b.onclick = () => {
        state.answers[q.id] = Number(b.dataset.v);
        save(state);
        root.querySelectorAll('.scale button').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        const nx = root.querySelector('#lf-next');
        if (nx) nx.disabled = false;
        const fin = root.querySelector('#lf-finish');
        if (fin && Object.keys(state.answers).length >= qs.length) fin.disabled = false;
      };
    });
    const prev = root.querySelector('#lf-prev');
    if (prev) prev.onclick = () => renderQuestion(root, data, index - 1);
    const next = root.querySelector('#lf-next');
    if (next) next.onclick = () => renderQuestion(root, data, index + 1);
    const finish = root.querySelector('#lf-finish');
    if (finish) finish.onclick = () => window.LF.App.finishAssessment(state);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.LF = window.LF || {};
  window.LF.Assessment = { renderNickname, renderQuestion, load, clear, firstUnanswered, escapeHtml };
})();
