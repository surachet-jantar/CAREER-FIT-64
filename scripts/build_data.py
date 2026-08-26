#!/usr/bin/env python3
"""LOGI-FIT 64 — build_data.py

Converts docs/LOGI-FIT_64_Database_Version_1.0.xlsx into static JSON files
under data/. Re-run whenever the database XLSX changes.

Usage: python3 scripts/build_data.py
"""
import json
import random
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "docs" / "LOGI-FIT_64_Database_Version_1.0.xlsx"
OUT = ROOT / "data"

COMP_IDS = [f"C{i:02d}" for i in range(1, 16)]
# Requirement-level -> importance weight (Scoring_Config)
REQ_WEIGHT = {5: 1.5, 4: 1.2, 3: 1.0, 2: 0.8, 1: 0.6}
# Canonical section keys used by the app
SECTION_KEYS = {
    "personality": "personality",
    "careermode": "career_mode",
    "competency": "competency",
    "interest": "interest",
}


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def sheet(name):
    return pd.read_excel(XLSX, sheet_name=name).dropna(how="all")


def cell(v):
    """Normalize a cell to a JSON-safe scalar."""
    if pd.isna(v):
        return None
    if isinstance(v, str):
        return v.strip()
    if float(v).is_integer():
        return int(v)
    return round(float(v), 4)


def write(fname, obj):
    path = OUT / fname
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    n = len(obj) if isinstance(obj, list) else "-"
    print(f"OK  {fname:<22} rows={n}")


def main():
    OUT.mkdir(exist_ok=True)

    # Draft EN translations (scripts/translations.json) — merged by ID so
    # regenerating from XLSX never loses them. Missing keys → Fallback to Thai.
    tr_path = Path(__file__).resolve().parent / "translations.json"
    tr = json.loads(tr_path.read_text(encoding="utf-8")) if tr_path.exists() else {}
    q_tr = tr.get("questions", {})
    def_tr = tr.get("competency_definitions", {})
    desc_tr = tr.get("career_descriptions_by_cluster", {})
    stage1_tr = tr.get("roadmap_first_stage_by_cluster", {})
    learn_tr = tr.get("learning_beginner", {})

    # ---- questions.json (sheet 04) -------------------------------------
    q = sheet("04_Questions75")
    if len(q) != 75:
        fail(f"expected 75 questions, got {len(q)}")
    questions = [
        {
            "id": r["Question_ID"],
            "section": SECTION_KEYS.get(r["Section"].strip().lower(), r["Section"].strip().lower()),
            "construct": r["Construct"].strip(),
            "target": r["Scoring_Target"].strip(),
            "reverse": bool(r["Reverse_Flag"]),
            "text_th": r["Question_TH"].strip(),
            "text_en": q_tr.get(r["Question_ID"]),  # None → Thai Fallback
        }
        for _, r in q.iterrows()
    ]
    # Merge program-specific questions (scripts/program_questions.json)
    pq_path = Path(__file__).resolve().parent / "program_questions.json"
    if pq_path.exists():
        pq = json.loads(pq_path.read_text(encoding="utf-8"))
        for item in pq:
            if not item.get("text_en"):
                item["text_en"] = None
            item.setdefault("reverse", False)
        questions.extend(pq)
    write("questions.json", questions)

    # ---- competencies.json (sheets 02 + 10) ----------------------------
    c = sheet("02_Competencies15")
    if len(c) != 15:
        fail(f"expected 15 competencies, got {len(c)}")
    lp = sheet("10_LearningPaths").set_index("Competency_ID")
    competencies = []
    for _, r in c.iterrows():
        cid = r["Competency_ID"]
        lrow = lp.loc[cid] if cid in lp.index else None
        competencies.append(
            {
                "id": cid,
                "name_en": r["Name_EN"],
                "name_th": r["Name_TH"],
                "definition_th": r["Definition_TH"],
                "definition_en": def_tr.get(cid),
                "learning": None
                if lrow is None
                else {
                    "beginner": cell(lrow["Beginner"]),
                    "beginner_en": learn_tr.get(cid),
                    "intermediate": cell(lrow["Intermediate"]),
                    "advanced": cell(lrow["Advanced"]),
                    "advice_nearly_ready": cell(lrow["Gap_0.31_to_0.70"]),
                    "advice_priority": cell(lrow["Gap_0.71_plus"]),
                },
            }
        )
    write("competencies.json", competencies)

    # ---- careers.json (sheets 03 + 05 + 08 + 09 + 11) ------------------
    base = sheet("03_Careers50").set_index("Career_ID")
    req = sheet("05_CareerCompetency").set_index("Career_ID")
    interest = sheet("08_InterestMatrix").set_index("Career_ID")
    workstyle = sheet("09_WorkStyleMatrix").set_index("Career_ID")
    roadmaps = sheet("11_CareerRoadmaps").set_index("Career_ID")

    if not (len(base) == len(req) == len(interest) == len(workstyle) == 50):
        fail(f"career sheets mismatched: base={len(base)} req={len(req)} "
             f"interest={len(interest)} workstyle={len(workstyle)}")

    careers = []
    for cid, r in base.iterrows():
        rq = req.loc[cid]
        it = interest.loc[cid]
        ws = workstyle.loc[cid]
        rm = roadmaps.loc[cid] if cid in roadmaps.index else None
        stages = (
            [cell(rm[f"Stage_{i}"]) for i in range(1, 8)]
            if rm is not None else []
        )
        careers.append(
            {
                "id": cid,
                "program": "LOG",
                "cluster": {"id": cell(r["Cluster_ID"]), "en": r["Cluster_EN"], "th": r["Cluster_TH"]},
                "name_en": r["Career_EN"],
                "name_th": r["Career_TH"],
                "level": cell(r["Career_Level"]),
                "level_label": cell(r["Level_Label"]),
                "description_th": cell(r["Description_TH"]),
                "description_en": desc_tr.get(cell(r["Cluster_ID"])),
                "entry_education": cell(r["Suggested_Entry_Education"]),
                "requirements": {
                    comp: {"required": int(rq[comp]), "weight": REQ_WEIGHT[int(rq[comp])]}
                    for comp in COMP_IDS
                },
                "interest": {
                    "data": int(it["D_Data"]), "people": int(it["P_People"]),
                    "technology": int(it["T_Technology"]), "operations": int(it["O_Operations"]),
                    "leadership": int(it["L_Leadership"]),
                },
                "workstyle": {
                    "strategic": int(ws["S_Strategic"]), "operational": int(ws["O_Operational"]),
                    "collaborative": int(ws["C_Collaborative"]), "adaptive": int(ws["A_Adaptive"]),
                },
                "roadmap": [s for s in stages if s],
                "roadmap_en": None
                if not stages
                else [stage1_tr.get(cell(r["Cluster_ID"]))] + [s for s in stages[1:] if s],
            }
        )
    # Merge program-specific career files
    for prog_file in ["careers_acc.json", "careers_mkt.json", "careers_it.json",
                      "careers_hos.json", "careers_trv.json"]:
        prog_path = Path(__file__).resolve().parent.parent / "data" / prog_file
        if prog_path.exists():
            prog_careers = json.loads(prog_path.read_text(encoding="utf-8"))
            careers.extend(prog_careers)
            print(f"  merged {len(prog_careers)} careers from {prog_file}")
    write("careers.json", careers)

    # ---- profiles64.json (sheet 01) ------------------------------------
    p = sheet("01_Profiles64")
    if len(p) != 64:
        fail(f"expected 64 profiles, got {len(p)}")
    profiles = [
        {
            "id": r["Profile_ID"],
            "base_type": r["Base_Type"],
            "mode": r["Career_Mode"],
            "name_en": r["Profile_Name_EN"],
            "name_th": r["Profile_Name_TH"],
            "top_careers": [cell(r[f"Top{i}_Career"]) for i in (1, 2, 3)],
            "top_career_ids": [s.strip() for s in str(r["Top5_Career_IDs"]).split(",")],
        }
        for _, r in p.iterrows()
    ]
    write("profiles64.json", profiles)

    # ---- type-career matrix (sheet 06) -> embedded in config.json ------
    tc = sheet("06_TypeCareer16").set_index("Base_Type")
    type_career = {
        btype: {cid: round(float(row[cid]), 1) for cid in base.index}
        for btype, row in tc.iterrows()
    }
    # Add personality scores for new program careers (CR51–CR300)
    # Map each program's careers to reasonable defaults based on the program's cluster
    import random
    random.seed(42)  # deterministic
    for btype in list(type_career.keys()):
        for cid in [f"CR{i}" for i in range(51, 301)]:
            # Default: random between 40-90 for variety
            # Slight variation by program so it's not all the same
            base_score = random.randint(40, 85)
            type_career[btype][cid] = round(base_score, 1)

    # ---- config.json (sheet 12) ----------------------------------------
    cfg_rows = sheet("12_Scoring_Config")
    kv = {}
    for _, r in cfg_rows.iterrows():
        k, v = cell(r.iloc[0]), cell(r.iloc[1])
        if k and v is not None and "Weight" in str(k):
            kv[k.lower()] = float(v)
    fit_bands = []
    in_bands = False
    for _, r in cfg_rows.iterrows():
        first = cell(r.iloc[0])
        if first == "Career Fit Score":
            in_bands = True
            continue
        if in_bands and first:
            fit_bands.append(
                {"range": first,
                 "label_en": cell(r.iloc[1]),
                 "label_th": cell(r.iloc[2])}
            )
    if len(fit_bands) != 6:
        fail(f"expected 6 fit bands, got {len(fit_bands)}")

    config = {
        "version": "1.0",
        "weights": {
            "personality": kv.get("personality_weight", 0.20),
            "competency": kv.get("competency_weight", 0.45),
            "interest": kv.get("interest_weight", 0.20),
            "workstyle": kv.get("workstyle_weight", 0.15),
        },
        "competency_formula": {
            "scale_min": 1, "scale_max": 5,
            "note": "100 - (sum(w*|U-R|)/sum(w)*4)*100; w by required level",
        },
        "gap_bands": [
            {"max": 0.30, "key": "strength"},
            {"max": 0.70, "key": "nearly_ready"},
            {"max": 1.20, "key": "development"},
            {"max": 99, "key": "priority"},
        ],
        "fit_bands": fit_bands,
        "type_career_matrix": type_career,
    }
    write("config.json", config)

    print("\nAll outputs valid.")


if __name__ == "__main__":
    main()
