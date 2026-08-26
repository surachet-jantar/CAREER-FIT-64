# CAREER-FIT 64

Career Intelligence System for every program of study — a frontend-only web app
that assesses students across personality, competency, interest, and work
style, then shows their career fit. Formerly LOGI-FIT 64 (logistics-only);
renamed when scope expanded to all programs.
_Avoid_: LOGI-FIT (legacy name), MBTI 64 (never an official MBTI product)

## Language

### Product concepts

**Program**:
The student's field of study (e.g. การบัญชี, การตลาด, โลจีสติกส์), chosen
before the assessment. It biases career ranking toward relevant careers but
never filters careers out.
_Avoid_: major filter, career category, faculty

**Program Boost**:
A small ranking multiplier applied to careers relevant to the chosen Program.
All careers remain ranked and visible.
_Avoid_: bonus score, filter, gate

**Career Set**:
The collection of careers belonging to one Program (target: 50 each). Every
career in any set uses the same 15-competency framework and result structure.
_Avoid_: career pool, career list

**Boost Magnitude**:
Final-fit cap applied to careers in the student's chosen Career Set
(currently ×1.06, capped at 100). Configurable in `config.json`.
_Avoid_: fixed bonus, score inflation

**Program Picker Timing**:
Shown before the assessment begins — between Welcome and Q1.
Full screen with 6 program cards. Student picks one, then starts the
75-question assessment (same questions for all programs in v1).
_Avoid_: post-assessment picker, embedded in question flow

**Program Picker Context**:
The picker asks "คุณกำลังเรียนหลักสูตรไหน?" / "Which program are you enrolled in?"
It identifies the student's current program — not a recommendation or exploration.
This affects: career boost (×1.06 for own set), result card label, PDF header.

**Program Picker Design**:
Text-only cards in a 3×2 grid. Each card: program name (TH/EN) + one-line
description. No icons, no color coding, no abbreviations. Minimal and fast.
_Avoid_: icons, color-coded cards, abbreviation labels

**Result Card Program Label**:
Program shown as a subtitle below the brand header.
"CAREER-FIT 64" stays at top. Second line: "หลักสูตร: บัญชี | Accounting".
Applies to: PNG card, result page header, PDF header.
_Avoid_: replacing brand with program name, hiding program on card

**Share Link Program Encoding**:
`packResult()` includes `p` field with short program code (LOG, ACC, etc.).
When viewer opens a shared link, program subtitle shows on result page and card.
`unpackResult()` restores program. ~3 extra bytes. Backward-compatible.
_Avoid_: omitting program from share, storing program server-side

**Cross-Program Careers**:
Each program has its own 50 careers. Overlap between programs is allowed.
If "Data Analyst" fits both IT and Accounting, it appears in both sets —
each with its own program-specific context (roadmap, emphasis, description).
No cross-referencing or shared-entry system needed.
_Avoid_: cross-program career references, forced unique-only sets

**Welcome Screen**:
"CAREER-FIT 64 | ระบบประเมินอาชีพ | Career Intelligence for Every Program"
General tagline, no specific programs listed. Program picker is the next screen.
_Avoid_: listing programs on welcome, logistics-only messaging

**Deployment & URL**:
Repo rename from `logifit64` → `careerfit64`. URL becomes `careerfit64.github.io`.
Old URL auto-redirects via GitHub Pages. **Deferred** — user will rename the repo later.
_Avoid_: custom domains, keeping logifit64 name

**Backward Compatibility**:
Versioned share link format. Add version byte to pack data.
v1 links (no `p` field) are detected and migrated on open.
`unpackResult()` handles both v1 and v2 formats gracefully.
_Avoid_: breaking old links, no migration path

**Data Pipeline for 250 New Careers**:
One XLSX per program: `data/logistics.xlsx`, `data/accounting.xlsx`, etc.
Each file has 50 careers in the same column format as the existing spreadsheet.
`build_data.py` reads all 6 XLSX files and merges into a single `careers.json`
with a `program` field per career entry.
_Avoid_: single master XLSX, manual JSON authoring

**Result Display Scope**:
Show only the 50 careers from the student's chosen program, ranked.
No cross-program comparison on the result page. Clean, focused, no overwhelm.
The boost (×1.06) already surfaces their program's careers appropriately.
_Avoid_: showing all 300, highlighting across programs

**Assessment Question Set**:
100 questions total. Split: 75 shared (universal) + 25 program-specific (~4-5 per program).
Q1-75: personality, interests, core competencies (same for all programs).
Q76-100: situational questions tailored to each program's domain.
`build_data.py` merges shared + per-program questions into `questions.json`.
_Avoid_: all 100 shared, >100 questions, no program-specific questions

**Local Folder Name**:
Keep as `LOGI-FIT 64` — no filesystem rename. Code inside says CAREER-FIT 64.
Matches existing git history and avoids VS Code workspace disruption.
_Avoid_: renaming local folder, new workspace setup

**Language Support**:
Full bilingual: TH and EN for everything — program picker, 100 questions,
all 300 careers, roadmaps, learning paths, UI strings. Uses existing
`L(th, en)` and `t(key)` infrastructure. No regression from current bilingual state.
_Avoid_: dropping EN toggle, English-only mode

**v1 Launch Scope**:
Full launch — all 6 programs ship together. Infrastructure (picker, scoring,
rename) + all 300 careers + all 100 questions ready on day one.
No phased rollout.
_Avoid_: phased launch, partial program set

**Competency Labels**:
15 clusters are renamed to be program-agnostic. Both TH and EN labels
are universal — no per-program variants.
Example: C01 becomes "จัดการข้อมูล | Manage Data" (not logistics-specific).
_Avoid_: per-program cluster renaming, logistics-only labels

**Shared Result**:
A read-only snapshot of one person's assessment outcome that anyone with the
link can view. Requires no login, no account, and no server-side storage.
_Avoid_: admin report, saved result, user profile

**Share Link**:
A URL that carries the encoded Shared Result inside itself (fragment), so the
result exists only in the link — not in any database.
_Avoid_: permanent link, account link

**Result Card**:
A downloadable visual summary of the Shared Result (image/PDF) intended for
sharing in chat apps such as LINE.
_Avoid_: certificate, report PDF

**Nickname**:
An optional display name entered before the assessment; blank means anonymous.
It travels inside the encoded result and appears on the Shared Result.
_Avoid_: username, account name, full name

### Content

**Thai-first**:
Thai is the canonical language of all content; English is an optional overlay
that may be incomplete at any time.
_Avoid_: bilingual-first, dual-language parity

**Fallback**:
When an English string is missing, the UI renders the Thai string instead —
never blank, never placeholder text.
_Avoid_: error state, empty translation

### Assessment model

**Career Fit**:
A 0–100 score of how well a person aligns with a specific career — an
alignment measure, NOT a probability of success.
_Avoid_: match chance, success rate

**Profile (64)**:
One of 64 career-personality archetypes: 16 personality types × 4 career modes.
_Avoid_: MBTI type (this is the LOGI-FIT framework, not official MBTI)

**Skill Gap**:
The distance between a person's current competency level and the level a
career requires.
_Avoid_: weakness, deficit
