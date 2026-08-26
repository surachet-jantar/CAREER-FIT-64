# CAREER-FIT 64

> Career Intelligence for Every Program — ระบบประเมินอาชีพ

Frontend-only web app that assesses students across **personality**, **competency**, **interest**, and **work style**, then ranks careers by fit. Built on a 16-personality × 4-career-mode model (64 profiles).

## Quick Start

```bash
# Serve locally (no build step required)
npx serve .
# or
python3 -m http.server 8000
```

Open `http://localhost:8000` (or `:8080` for Python) in your browser.

## How It Works

1. **Program Picker** — student selects their program of study
2. **Assessment** — 75 questions across 4 dimensions
3. **Results** — ranked career list with fit %, competency readiness, skill gaps, and career roadmap

## Project Structure

```
index.html          Entry point
css/app.css         Styles
js/
  app.js            Router & screen management
  assessment.js     Question flow & scoring input
  scoring.js        Score engine (weights, competency formula, ranking)
  result.js         Result rendering & career cards
  share.js          Share-link encoding/decoding
  i18n.js           Thai / English toggling
data/
  config.json       Weights, gap bands, boost magnitude
  careers.json      Cross-program career base
  careers_*.json    Per-program career sets (50 each)
  competencies.json 15-competency framework
  profiles64.json   64 personality-mode profiles
  programs.json     Program definitions
  questions.json    Assessment questions
scripts/
  build_data.py     Merges & validates data files
  gen_careers.js    Career-set generator
```

## Configuration

| Key | Location | Description |
|-----|----------|-------------|
| `boost_magnitude` | `data/config.json` | Program boost multiplier (default ×1.06, cap 100) |
| `weights` | `data/config.json` | Dimension weights (personality 0.20, competency 0.45, interest 0.20, workstyle 0.15) |
| `gap_bands` | `data/config.json` | Skill-gap threshold bands |

## Sharing

Results are encoded into the URL fragment (no server needed). Share links carry personality type, program, scores, and ranked career IDs — fully self-contained.

## License

Internal educational project. Not for commercial distribution.
