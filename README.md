# EOS Atlas — Early-Onset Scoliosis Phenotype & Outcomes (PSSG0379)

React (Vite) app that assigns a child with early-onset scoliosis to one of the three PSSG0379 patient
phenotypes and shows two-year registry outcomes (UPROR, major complication MCDS >=3b, EOSQ-24 change)
for each surgical-strategy cluster.

Research use only. Not externally validated; not a medical device.

## Run
    npm install
    npm run dev        # local dev server
    npm run build      # static site in dist/ (deploy anywhere: GitHub Pages, Netlify, Columbia web)
    node build-artifact.mjs   # single-file HTML (React from cdnjs) for hosting as one page

## How it works
- `src/model.json` holds aggregate parameters only: winsorization limits (1st/99th pct) per variable,
  per-phenotype quantile grids (1st-99th pct, 99 points) for the nine clustering variables, phenotype
  medians, and the Table 4 phenotype x strategy outcome grid. No patient-level rows.
- `src/model.js` assigns a patient to the phenotype with the smallest mean Gower distance to that
  phenotype's distribution (approximates the held-out-site assignment rule). Needs >= 6 of 9 variables.
  5-fold CV agreement with the Ward labels: 86.8% overall; 97.6% (high confidence, relative margin >= 0.15),
  74.6% (moderate, 0.05-0.15), 61.7% (low, < 0.05).
- Planned surgery -> strategy cluster by rule (traction -> Traction-assisted; fusion -> Fusion;
  growing rods + pelvic fixation -> Growing rods to pelvis; VEPTR/TGR; otherwise MCGR).
  Agrees with the actual surgical cluster in 96% of registry patients.
- `scripts/export_model.py` regenerates `model.json` from the pipeline outputs (`analysis_dataset.csv`,
  `clusters.csv`, `Table4_PxS_outcomes.csv`). Re-run it if the clustering is re-run.
