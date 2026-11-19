// Phenotype classifier and outcome lookup for the PSSG0379 EOS clusters.
// Uses only aggregate parameters (per-cluster quantile grids); no patient rows ship with the app.
import M from "./model.json";

export const FEATURES = [
  { key: "age_at_surgery", label: "Age at surgery", unit: "yr", step: 0.1, min: 0, max: 21 },
  { key: "bmi", label: "Body-mass index", unit: "kg/m²", step: 0.1, min: 8, max: 60 },
  { key: "asa", label: "ASA class", unit: "", step: 1, min: 1, max: 5, options: [1, 2, 3, 4] },
  { key: "n_comorbidities", label: "Comorbidities", unit: "count", step: 1, min: 0, max: 40 },
  { key: "major_cobb", label: "Major Cobb angle", unit: "°", step: 1, min: 5, max: 180 },
  { key: "kyphosis", label: "Maximum kyphosis", unit: "°", step: 1, min: -60, max: 180 },
  { key: "coronal_balance", label: "Coronal balance", unit: "mm", step: 1, min: 0, max: 150 },
  { key: "sagittal_balance", label: "Sagittal balance", unit: "mm", step: 1, min: -150, max: 150 },
  { key: "ambulatory_ord", label: "Ambulatory status", unit: "", options: [
    { value: 1, label: "Ambulatory" }, { value: 0.5, label: "Limited / household" },
    { value: 0, label: "Non-ambulatory" }] },
];

export const PHENOTYPES = {
  1: { name: "Young Ambulatory", short: "Young ambulatory", color: "p1",
       blurb: "Youngest children (median 4.9 yr), nearly all ambulatory. Mostly congenital, idiopathic and syndromic." },
  2: { name: "Older Low-Comorbidity", short: "Older low-comorbidity", color: "p2",
       blurb: "Older children (median 10.2 yr), ambulatory, with the lowest ASA class, comorbidity burden and curve size." },
  3: { name: "Non-Ambulatory Complex", short: "Non-ambulatory complex", color: "p3",
       blurb: "89% non-ambulatory, ASA 3, the most comorbidities and the largest, most kyphotic curves. 72% neuromuscular." },
};

export const STRATEGIES = {
  1: { name: "VEPTR / TGR", desc: "Traditional distraction implants, no traction or pelvic fixation" },
  2: { name: "MCGR", desc: "Magnetically controlled growing rods (incl. most tether / growth-guided)" },
  3: { name: "Fusion", desc: "Definitive posterior fusion" },
  4: { name: "Traction-assisted", desc: "Any construct with halo-gravity or other traction" },
  5: { name: "Growing rods to pelvis", desc: "VEPTR/TGR or MCGR with pelvic fixation" },
};

// Calibrated on 5-fold cross-validation against the Ward cluster labels (n = 3,005).
export const CONFIDENCE = [
  { band: "high", min: 0.15, agreement: 97.6, label: "High" },
  { band: "moderate", min: 0.05, agreement: 74.6, label: "Moderate" },
  { band: "low", min: -1, agreement: 61.7, label: "Low" },
];

const F = M.features;

export function classify(values) {
  const x = F.map((k) => (values[k] === "" || values[k] == null || Number.isNaN(+values[k]) ? null : +values[k]));
  const observed = x.map((v, j) => (v == null ? -1 : j)).filter((j) => j >= 0);
  if (observed.length < 6) return { ok: false, observed: observed.length };
  const perFeature = {};
  const dist = [1, 2, 3].map((k) => {
    const q = M.quantiles[String(k)];
    let s = 0;
    for (const j of observed) {
      const range = M.hi[j] - M.lo[j] || 1;
      const v = Math.min(Math.max(x[j], M.lo[j]), M.hi[j]);
      const grid = q[j];
      let m = 0;
      for (const g of grid) m += Math.abs(v - g);
      const d = m / grid.length / range;
      (perFeature[F[j]] ||= {})[k] = d;
      s += d;
    }
    return s / observed.length;
  });
  const order = [0, 1, 2].sort((a, b) => dist[a] - dist[b]);
  const best = order[0] + 1, second = order[1] + 1;
  const margin = (dist[order[1]] - dist[order[0]]) / dist[order[1]];
  const confidence = CONFIDENCE.find((c) => margin >= c.min);
  // features that most favour the assigned phenotype over the runner-up
  const drivers = Object.entries(perFeature)
    .map(([key, d]) => ({ key, gain: d[second] - d[best] }))
    .sort((a, b) => b.gain - a.gain);
  return { ok: true, observed: observed.length, dist, best, second, margin, confidence, drivers };
}

export function strategyFromPlan(plan) {
  if (plan.traction) return 4;
  if (plan.implant === "fusion") return 3;
  if (plan.pelvis && (plan.implant === "veptr" || plan.implant === "mcgr")) return 5;
  if (plan.implant === "veptr") return 1;
  return 2;
}

export function cell(P, S) {
  return M.grid.find((g) => g.P === P && g.S === S);
}

export function profile(P) {
  return M.profiles[String(P)];
}
