/* LOGI-FIT 64 — wiki.js
   Wiki-style docs: lazy-loaded pages, sidebar nav, bilingual content. */
(function () {
  'use strict';
  const { t, L } = window.LF;
  const esc = (s) => window.LF.Assessment.escapeHtml(String(s ?? ''));

  /* ---------- cache ---------- */
  const cache = {}; // slug → page data

  async function loadPage(slug) {
    if (cache[slug]) return cache[slug];
    const res = await fetch('data/wiki/' + slug + '.json');
    if (!res.ok) throw new Error('wiki page not found: ' + slug);
    cache[slug] = await res.json();
    return cache[slug];
  }

  /* ---------- sidebar ---------- */

  function renderSidebar(index, activeSlug) {
    const items = index.pages.map((p) => {
      const active = p.slug === activeSlug ? ' wiki-nav-active' : '';
      return `<a class="wiki-nav-item${active}" href="#docs/${esc(p.slug)}">
        <span class="wiki-nav-icon">${p.icon}</span>
        <span class="wiki-nav-label">${esc(L(p.title_th, p.title_en))}</span>
      </a>`;
    }).join('');

    return `<nav class="wiki-sidebar" id="wiki-sidebar">
      <div class="wiki-sidebar-header">📚 ${esc(index.title_th)}</div>
      <a class="wiki-nav-item" href="#docs">
        <span class="wiki-nav-icon">🏠</span>
        <span class="wiki-nav-label">${esc(t('wiki_landing'))}</span>
      </a>
      ${items}
    </nav>`;
  }

  function renderMobileToggle() {
    return `<button class="wiki-hamburger no-print" id="wiki-hamburger" aria-label="Menu">☰</button>`;
  }

  /* ---------- landing page ---------- */

  function renderLanding(index) {
    const intro = esc(L(index.intro_th, index.intro_en));
    const cards = index.pages.map((p) => {
      return `<a class="wiki-card wiki-card-link" href="#docs/${esc(p.slug)}">
        <div class="wiki-card-icon">${p.icon}</div>
        <div class="wiki-card-title">${esc(L(p.title_th, p.title_en))}</div>
        <div class="wiki-card-desc">${esc(L(p.desc_th, p.desc_en))}</div>
      </a>`;
    }).join('');

    return `<div class="wiki-article">
      <h1 class="wiki-title">${esc(index.title_th)}</h1>
      <p class="wiki-intro">${intro}</p>
      <div class="wiki-grid">${cards}</div>
    </div>`;
  }

  /* ---------- article page ---------- */

  function renderArticle(page, slug) {
    const sections = page.sections.map((s) => {
      const body = L(s.body_th, s.body_en);
      return `<section class="wiki-section">
        <h2 class="wiki-heading" id="wiki-h-${esc(s.heading_th.replace(/\s+/g, '-').toLowerCase())}">
          ${esc(L(s.heading_th, s.heading_en))}
          <a class="wiki-anchor" href="#docs/${esc(slug)}#${esc(s.heading_th.replace(/\s+/g, '-').toLowerCase())}" aria-label="Link">#</a>
        </h2>
        <div class="wiki-body">${body}</div>
      </section>`;
    }).join('');

    const related = (page.related || []).map((r) => {
      return `<a class="wiki-related-link" href="#docs/${esc(r)}">${esc(t('wiki_' + r))}</a>`;
    }).join(' · ');

    return `<div class="wiki-article">
      <h1 class="wiki-title">${esc(L(page.title_th, page.title_en))}</h1>
      ${sections}
      ${related ? `<div class="wiki-related"><strong>${esc(t('wiki_related'))}</strong> ${related}</div>` : ''}
    </div>`;
  }

  /* ---------- main render ---------- */

  async function render(root, data, slug, opts) {
    root.innerHTML = `<div class="processing card"><div class="orbit"></div><p class="muted">${esc(t('wiki_loading'))}</p></div>`;

    try {
      const index = await loadPage('index');
      const fromResult = opts.fromResult || location.hash.includes('from=result');

      let pageContent;
      let activeSlug = null;

      if (slug) {
        const page = await loadPage(slug);
        activeSlug = slug;
        pageContent = renderArticle(page, slug);
      } else {
        pageContent = renderLanding(index);
      }

      const sidebar = renderSidebar(index, activeSlug);
      const hamburger = renderMobileToggle();
      const backBanner = fromResult
        ? `<div class="wiki-back-banner no-print"><a href="#result">← ${esc(t('wiki_back_result'))}</a></div>`
        : '';

      root.innerHTML = `<div class="wiki-layout">
        ${hamburger}
        ${sidebar}
        <div class="wiki-content">
          ${backBanner}
          ${pageContent}
        </div>
      </div>`;

      /* --- mobile hamburger toggle --- */
      const hamburgerBtn = root.querySelector('#wiki-hamburger');
      const sidebarEl = root.querySelector('#wiki-sidebar');
      if (hamburgerBtn && sidebarEl) {
        hamburgerBtn.onclick = () => {
          sidebarEl.classList.toggle('wiki-sidebar-open');
          hamburgerBtn.textContent = sidebarEl.classList.contains('wiki-sidebar-open') ? '✕' : '☰';
        };
        /* close sidebar on nav click (mobile) */
        sidebarEl.addEventListener('click', (e) => {
          if (e.target.closest('.wiki-nav-item')) {
            sidebarEl.classList.remove('wiki-sidebar-open');
            hamburgerBtn.textContent = '☰';
          }
        });
      }

    } catch (e) {
      root.innerHTML = `<div class="error-screen card">
        <h2>⚠️</h2>
        <p class="muted">${esc(t('wiki_error'))}</p>
      </div>`;
    }
  }

  window.LF = window.LF || {};
  window.LF.Wiki = { render };
})();
