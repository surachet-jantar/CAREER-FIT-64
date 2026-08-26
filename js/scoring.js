/* LOGI-FIT 64 — scoring.js
   Deterministic rule-based engine (blueprint §29: no AI in scoring).
   All formulas come from data/config.json (sheet 12_Scoring_Config). */
(function () {
  'use strict';

  const LEADING = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };
  const OPPOSITE = { E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' };

  /* Personality axes: leading-pole items use raw response, opposite-pole use
     6-raw; axis pct = ((sum-8)/32)*100; >=50 selects the leading pole. */
  function personality(answers, questions) {
    const axes = {};
    for (const axis of Object.keys(LEADING)) {
      let sum = 0;
      for (const q of questions) {
        if (q.section !== 'personality' || q.construct !== axis) continue;
        const raw = answers[q.id];
        if (raw == null) continue;
        sum += q.target === LEADING[axis] ? raw : 6 - raw;
      }
      const pct = ((sum - 8) / 32) * 100;
      const letter = pct >= 50 ? LEADING[axis] : OPPOSITE[LEADING[axis]];
      axes[axis] = { pct: Math.round(pct), letter, clarity: Math.abs(pct - 50) * 2 };
    }
    const code = ['EI', 'SN', 'TF', 'JP'].map((a) => axes[a].letter).join('');
    return { code, axes };
  }

  /* Career mode: average of two Likert items per S/O/C/A. */
  function careerMode(answers, questions) {
    const sums = { S: [0, 0], O: [0, 0], C: [0, 0], A: [0, 0] };
    for (const q of questions) {
      if (q.section !== 'career_mode') continue;
      const raw = answers[q.id];
      if (raw == null) continue;
      sums[q.target][0] += raw;
      sums[q.target][1] += 1;
    }
    const scores = {};
    for (const k of Object.keys(sums)) scores[k] = sums[k][1] ? +(sums[k][0] / sums[k][1]).toFixed(2) : 0;
    const dominant = Object.keys(scores).reduce((a, b) => (scores[b] > scores[a] ? b : a));
    return { scores, dominant };
  }

  /* Competencies: average of two items per C01..C15 → 1.0–5.0 */
  function competencies(answers, questions) {
    const acc = {};
    for (const q of questions) {
      if (q.section !== 'competency') continue;
      const raw = answers[q.id];
      if (raw == null) continue;
      (acc[q.construct] = acc[q.construct] || []).push(raw);
    }
    const out = {};
    for (const [cid, arr] of Object.entries(acc)) {
      out[cid] = +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
    }
    return out;
  }

  /* Interest: one item per D/P/T/O/L dimension (raw 1–5) */
  function interest(answers, questions) {
    const out = {};
    for (const q of questions) {
      if (q.section !== 'interest') continue;
      const raw = answers[q.id];
      if (raw != null) out[q.target] = raw;
    }
    return out;
  }

  /* Competency alignment: 100 − (Σw·|U−R| / Σw·4)·100 */
  function competencyFit(userComp, career) {
    let num = 0, den = 0;
    for (const [cid, req] of Object.entries(career.requirements)) {
      const u = userComp[cid];
      if (u == null) continue;
      num += req.weight * Math.abs(u - req.required);
      den += req.weight * 4;
    }
    if (!den) return 50;
    return Math.max(0, 100 - (num / den) * 100);
  }

  function interestFit(userInt, career) {
    const dims = ['D', 'P', 'T', 'O', 'L'];
    let diff = 0;
    for (const d of dims) {
      const u = userInt[d];
      if (u == null) continue;
      diff += Math.abs(u - career.interest[{ D: 'data', P: 'people', T: 'technology', O: 'operations', L: 'leadership' }[d]]);
    }
    return Math.max(0, 100 - (diff / (5 * 4)) * 100);
  }

  function workStyleFit(modeScores, career) {
    const pairs = [['S', 'strategic'], ['O', 'operational'], ['C', 'collaborative'], ['A', 'adaptive']];
    let diff = 0;
    for (const [k, key] of pairs) diff += Math.abs((modeScores[k] ?? 0) - career.workstyle[key]);
    return Math.max(0, 100 - (diff / (4 * 4)) * 100);
  }

  function gapBand(gap, bands) {
    for (const b of bands) if (gap <= b.max) return b.key;
    return 'priority';
  }

  /* Rank careers from precomputed user vectors.
     program: optional short code (e.g. "LOG") — filters to that program's
     careers and applies a boost multiplier from config. */
  function rank(user, data, program) {
    const { careers, config } = data;
    const matrixRow = config.type_career_matrix[user.profileCode] || {};
    const boost = config.program_boost || { multiplier: 1.06, cap: 100 };

    // Filter to program's careers if a program is specified
    let pool = careers;
    if (program) {
      pool = careers.filter((c) => c.program === program);
      if (!pool.length) pool = careers; // fallback: no matching careers
    }

    const ranked = pool
      .map((career) => {
        const p = matrixRow[career.id] ?? 70;
        const c = competencyFit(user.compScores, career);
        const i = interestFit(user.interestScores, career);
        const w = workStyleFit(user.modeScores, career);
        let fit =
          config.weights.personality * p +
          config.weights.competency * c +
          config.weights.interest * i +
          config.weights.workstyle * w;
        // Apply program boost
        if (program && career.program === program) {
          fit = Math.min(boost.cap, fit * boost.multiplier);
        }
        fit = Math.round(fit * 10) / 10;
        return { career, fit, parts: { p: Math.round(p), c: Math.round(c), i: Math.round(i), w: Math.round(w) } };
      })
      .sort((a, b) => b.fit - a.fit);

    return ranked.slice(0, 10).map((r) => ({
      id: r.career.id,
      fit: r.fit,
      parts: r.parts,
      gaps: skillGaps(user.compScores, r.career, config),
    }));
  }

  /* Full pipeline: answers → user vectors → ranked careers */
  function scoreAll(answers, data, program) {
    const { questions } = data;
    const pers = personality(answers, questions);
    const mode = careerMode(answers, questions);
    const comp = competencies(answers, questions);
    const ints = interest(answers, questions);

    return {
      version: 2,
      profileCode: pers.code,
      modeDominant: mode.dominant,
      modeScores: mode.scores,
      axes: pers.axes,
      compScores: comp,
      interestScores: ints,
      program: program || '',
      top10: rank({ profileCode: pers.code, modeScores: mode.scores, compScores: comp, interestScores: ints }, data, program),
      createdAt: new Date().toISOString(),
    };
  }

  function skillGaps(compScores, career, config) {
    const gaps = [];
    for (const [cid, req] of Object.entries(career.requirements)) {
      const current = compScores[cid];
      if (current == null) continue;
      const gap = Math.max(0, req.required - current);
      gaps.push({ cid, current, required: req.required, gap: +gap.toFixed(2), band: gapBand(gap, config.gap_bands) });
    }
    gaps.sort((a, b) => b.gap - a.gap);
    return gaps;
  }

  window.LF = window.LF || {};
  window.LF.Scoring = { scoreAll, rank, skillGaps, personality, careerMode, competencies, interest };
})();
