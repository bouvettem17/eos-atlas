import React, { useMemo, useState } from "react";
import { FEATURES, PHENOTYPES, STRATEGIES, classify, strategyFromPlan, cell, profile } from "./model.js";

const EXAMPLE = { age_at_surgery: "5.2", height_ft: "3", height_in: "7", weight_lb: "40.5", asa: "2", n_comorbidities: "1", major_cobb: "74",
  kyphosis: "52", coronal_balance: "16", sagittal_balance: "18", ambulatory_ord: "1" };
const EMPTY = { ...Object.fromEntries(FEATURES.map((f) => [f.key, ""])), height_ft: "", height_in: "", weight_lb: "" };

// BMI (kg/m²) from height in feet + inches and weight in pounds; null until both are valid.
function bmiFrom(v) {
  const ft = v.height_ft === "" ? null : +v.height_ft;
  const inch = v.height_in === "" ? 0 : +v.height_in;
  const lb = v.weight_lb === "" ? null : +v.weight_lb;
  if (ft == null || lb == null || Number.isNaN(ft) || Number.isNaN(inch) || Number.isNaN(lb)) return null;
  const totalIn = ft * 12 + inch;
  if (totalIn < 12 || lb <= 0) return null;
  return (703 * lb) / (totalIn * totalIn);
}
const byKey = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

const GROUPS = [
  { title: "Patient", keys: ["age_at_surgery", "height", "weight", "asa", "n_comorbidities", "ambulatory_ord"] },
  { title: "Radiographs", keys: ["major_cobb", "kyphosis", "coronal_balance", "sagittal_balance"] },
];
const HELP = {
  age_at_surgery: "At the planned index procedure",
  n_comorbidities: "Distinct diagnoses, excluding scoliosis",
  kyphosis: "Maximum thoracic kyphosis",
  coronal_balance: "C7 plumb line to CSVL, absolute",
  sagittal_balance: "C7 plumb line to posterior S1; positive = anterior",
};
const METRICS = {
  upror: { label: "Unplanned return to OR", short: "UPROR", unit: "%", domain: [0, 60], ticks: [0, 10, 20, 30, 40, 50, 60] },
  major: { label: "Major complication", short: "Major complication", unit: "%", domain: [0, 60], ticks: [0, 10, 20, 30, 40, 50, 60] },
  deosq: { label: "EOSQ-24 change", short: "EOSQ-24 change", unit: " pts", domain: [-15, 20], ticks: [-15, -10, -5, 0, 5, 10, 15, 20] },
};
const fmt = (v, d = 1) => (v == null ? "–" : Number(v).toFixed(d));
const signed = (v) => (v == null ? "–" : (v > 0 ? "+" : "") + Number(v).toFixed(1));

export function Logo({ size = 30 }) {
  // Five vertebral bodies on a gentle S-curve
  const pts = [[13, 6.5, -14], [17.5, 11.5, -6], [18.5, 16.5, 4], [16, 21.5, 12], [12, 26.5, 6]];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      {pts.map(([x, y, r], i) => (
        <rect key={i} x={x - 5} y={y - 1.9} width="10" height="3.8" rx="1.4" fill="#fff"
          transform={`rotate(${r} ${x} ${y})`} opacity={i === 2 ? 1 : 0.92} />
      ))}
    </svg>
  );
}

function Segmented({ name, options, value, onChange, cols }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name} style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={String(value) === String(v)}
          className={String(value) === String(v) ? "on" : ""}
          onClick={() => onChange(String(value) === String(v) ? "" : String(v))}>{l}</button>
      ))}
    </div>
  );
}

function InputRow({ f, value, onChange }) {
  const id = `f-${f.key}`;
  const out = value !== "" && f.min != null && (+value < f.min || +value > f.max);
  let control;
  if (f.key === "asa") {
    control = <Segmented name={f.label} value={value} onChange={(v) => onChange(f.key, v)} cols={4}
      options={[["1", "I"], ["2", "II"], ["3", "III"], ["4", "IV"]]} />;
  } else if (f.key === "ambulatory_ord") {
    control = <Segmented name={f.label} value={value} onChange={(v) => onChange(f.key, v)} cols={3}
      options={[["1", "Ambulatory"], ["0.5", "Limited"], ["0", "Non-amb."]]} />;
  } else {
    control = (
      <div className={`num-input${out ? " invalid" : ""}`}>
        <input id={id} type="number" inputMode="decimal" step={f.step} min={f.min} max={f.max}
          placeholder="—" value={value} onChange={(e) => onChange(f.key, e.target.value)} />
        {f.unit && <span className="suffix">{f.unit}</span>}
      </div>
    );
  }
  const isNum = !(f.key === "asa" || f.key === "ambulatory_ord");
  return (
    <div className="row">
      <div className="row-label">
        {isNum ? <label htmlFor={id}>{f.label}</label> : <span>{f.label}</span>}
        {HELP[f.key] && <small>{HELP[f.key]}</small>}
        {out && <small className="err">Expected {f.min}–{f.max} {f.unit}</small>}
      </div>
      <div className="row-control">{control}</div>
    </div>
  );
}

function NumBox({ id, value, onChange, unit, step, min, max, invalid, label }) {
  return (
    <div className={`num-input${invalid ? " invalid" : ""}`}>
      <input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} aria-label={label}
        placeholder="—" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="suffix">{unit}</span>
    </div>
  );
}

function HeightRow({ values, onChange }) {
  const ftBad = values.height_ft !== "" && (+values.height_ft < 1 || +values.height_ft > 7);
  const inBad = values.height_in !== "" && (+values.height_in < 0 || +values.height_in >= 12);
  return (
    <div className="row">
      <div className="row-label">
        <label htmlFor="f-height_ft">Height</label>
        <small>Used with weight to calculate BMI</small>
        {(ftBad || inBad) && <small className="err">Expected 1–7 ft and 0–11 in</small>}
      </div>
      <div className="row-control pair">
        <NumBox id="f-height_ft" label="Height, feet" unit="ft" step={1} min={1} max={7} value={values.height_ft} invalid={ftBad}
          onChange={(v) => onChange("height_ft", v)} />
        <NumBox id="f-height_in" label="Height, inches" unit="in" step={0.5} min={0} max={11.5} value={values.height_in} invalid={inBad}
          onChange={(v) => onChange("height_in", v)} />
      </div>
    </div>
  );
}

function WeightRow({ values, onChange, bmi }) {
  const bad = values.weight_lb !== "" && (+values.weight_lb < 5 || +values.weight_lb > 400);
  return (
    <div className="row">
      <div className="row-label">
        <label htmlFor="f-weight_lb">Weight</label>
        <small>{bmi != null ? `BMI ${bmi.toFixed(1)} kg/m² (calculated)` : "Pounds"}</small>
        {bad && <small className="err">Expected 5–400 lb</small>}
      </div>
      <div className="row-control">
        <NumBox id="f-weight_lb" label="Weight, pounds" unit="lb" step={0.1} min={5} max={400} value={values.weight_lb} invalid={bad}
          onChange={(v) => onChange("weight_lb", v)} />
      </div>
    </div>
  );
}

function PlanRows({ plan, setPlan }) {
  return (
    <>
      <div className="row">
        <div className="row-label"><span>Implant</span><small>Planned index construct</small></div>
        <div className="row-control">
          <Segmented name="Implant" cols={2} value={plan.implant} onChange={(v) => v && setPlan({ ...plan, implant: v })}
            options={[["veptr", "VEPTR / TGR"], ["mcgr", "MCGR"], ["fusion", "Fusion"], ["other", "Tether / guided"]]} />
        </div>
      </div>
      <div className="row">
        <div className="row-label"><span>Traction</span><small>Halo-gravity or intraoperative</small></div>
        <div className="row-control">
          <Segmented name="Traction" cols={2} value={plan.traction ? "y" : "n"} onChange={(v) => setPlan({ ...plan, traction: v === "y" })}
            options={[["n", "No"], ["y", "Yes"]]} />
        </div>
      </div>
      <div className={`row${plan.implant === "fusion" || plan.implant === "other" ? " muted-row" : ""}`}>
        <div className="row-label"><span>Pelvic fixation</span><small>Applies to growing constructs</small></div>
        <div className="row-control">
          <Segmented name="Pelvic fixation" cols={2} value={plan.pelvis ? "y" : "n"} onChange={(v) => setPlan({ ...plan, pelvis: v === "y" })}
            options={[["n", "No"], ["y", "Yes"]]} />
        </div>
      </div>
    </>
  );
}

function ConfidenceMeter({ band }) {
  const n = { low: 1, moderate: 2, high: 3 }[band];
  return <span className={`meter m-${band}`} aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? "f" : ""} />)}</span>;
}

function ResultPanel({ res, S }) {
  if (!res.ok) {
    return (
      <aside className="result" id="result" aria-live="polite">
        <div className="result-head pending">
          <span className="result-kicker">Result</span>
          <span className="progress">{res.observed} / 9 entered</span>
        </div>
        <div className="result-body">
          <p className="placeholder">Enter at least 6 of the 9 preoperative variables to assign a phenotype.</p>
          <div className="progress-track"><span style={{ width: `${(res.observed / 6) * 100 > 100 ? 100 : (res.observed / 6) * 100}%` }} /></div>
        </div>
      </aside>
    );
  }
  const P = PHENOTYPES[res.best];
  const c = cell(res.best, S);
  return (
    <aside className="result" id="result" aria-live="polite">
      <div className={`result-head ph-${res.best}`}>
        <span className="result-kicker">Phenotype {res.best} of 3</span>
        <span className="result-title">{P.name}</span>
        <span className="result-conf"><ConfidenceMeter band={res.confidence.band} />{res.confidence.label} confidence · {fmt(res.confidence.agreement, 0)}% CV agreement</span>
      </div>
      <div className="result-body">
        <p className="interp">{P.blurb}</p>
        <div className="outcome-head">
          <span>2-year outcomes</span>
          <span>{STRATEGIES[S].name} · n = {c.n}</span>
        </div>
        {!c.reportable && <p className="caution">Only {c.n} registry patients had this combination. Estimates are unstable.</p>}
        <dl className={`outcomes${c.reportable ? "" : " faint"}`}>
          <Outcome label="Unplanned return to OR" v={c.upror} unit="%" />
          <Outcome label="Major complication (MCDS ≥ 3b)" v={c.major} unit="%" />
          <Outcome label="EOSQ-24 change" v={c.deosq} unit=" pts" signedVal />
        </dl>
        <p className="fine">Observed registry rates with 95% CI. EOSQ-24 from {c.eosq_n} paired scores; mean major Cobb change {fmt(c.dcobb)}°.</p>
      </div>
    </aside>
  );
}

function Outcome({ label, v, unit, signedVal }) {
  const f = signedVal ? signed : fmt;
  return (
    <div className="outcome">
      <dt>{label}</dt>
      <dd>
        <span className="val">{v ? f(v[0]) : "–"}<small>{unit.trim()}</small></span>
        <span className="ci">{v ? `${f(v[1])} to ${f(v[2])}` : "not estimable"}</span>
      </dd>
    </div>
  );
}

function MobileBar({ res }) {
  return (
    <a href="#result" className={`mobile-bar${res.ok ? ` ph-${res.best}` : ""}`}>
      {res.ok ? <><span>Phenotype</span><strong>{PHENOTYPES[res.best].name}</strong></>
        : <><span>Result</span><strong>{res.observed} / 9 variables entered</strong></>}
      <span className="arrow" aria-hidden="true">↓</span>
    </a>
  );
}

function ForestChart({ P, alt, S, metric }) {
  const m = METRICS[metric];
  const W = 900, rowH = 44, left = 200, right = 20, top = 6, H = top + rowH * 5 + 30;
  const x = (v) => left + ((Math.min(Math.max(v, m.domain[0]), m.domain[1]) - m.domain[0]) / (m.domain[1] - m.domain[0])) * (W - left - right);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${m.label} by surgical strategy`}>
        {[1, 2, 3, 4, 5].map((s, i) => s === S && (
          <rect key="hl" x={0} y={top + rowH * i + 2} width={W} height={rowH - 4} className="row-hl" />
        ))}
        {m.ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={top + rowH * 5} className={t === 0 && metric === "deosq" ? "zero" : "grid"} />
            <text x={x(t)} y={top + rowH * 5 + 18} className="tick" textAnchor="middle">{t}{m.unit.trim() === "%" ? "%" : ""}</text>
          </g>
        ))}
        {[1, 2, 3, 4, 5].map((s, i) => {
          const c = cell(P, s), y = top + rowH * i + rowH / 2, v = c[metric];
          const a = alt ? cell(alt, s)[metric] : null;
          return (
            <g key={s} className={s === S ? "frow sel" : "frow"}>
              <text x={14} y={y - 2} className="flabel">{STRATEGIES[s].name}</text>
              <text x={14} y={y + 14} className="fn">n = {c.n}{!c.reportable ? " · too few" : ""}</text>
              {a && <g className="alt"><line x1={x(a[1])} x2={x(a[2])} y1={y + 8} y2={y + 8} /><circle cx={x(a[0])} cy={y + 8} r={4} /></g>}
              {v && <g className={c.reportable ? "est" : "est faint"}>
                <line x1={x(v[1])} x2={x(v[2])} y1={y} y2={y} />
                <rect x={x(v[0]) - 5.5} y={y - 5.5} width={11} height={11} />
              </g>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Compare({ res, S }) {
  const [metric, setMetric] = useState("upror");
  if (!res.ok) return null;
  const showAlt = res.confidence.band !== "high";
  return (
    <section className="panel" aria-labelledby="cmp">
      <div className="panel-head">
        <div>
          <h2 id="cmp">Compare strategies</h2>
          <p className="sub">All five surgical strategy clusters for {PHENOTYPES[res.best].name.toLowerCase()} patients. Selected plan highlighted.</p>
        </div>
        <div className="tabs-small" role="tablist" aria-label="Outcome">
          {Object.entries(METRICS).map(([k, mm]) => (
            <button key={k} type="button" role="tab" aria-selected={metric === k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{mm.short}</button>
          ))}
        </div>
      </div>
      <ForestChart P={res.best} alt={showAlt ? res.second : null} S={S} metric={metric} />
      <div className="legend">
        <span><i className="sq" /> {PHENOTYPES[res.best].name} (point estimate, 95% CI)</span>
        {showAlt && <span><i className="ring" /> Runner-up: {PHENOTYPES[res.second].name}</span>}
      </div>
      {(S === 1 || S === 2) && (
        <div className="callout">
          <strong>Treatment era.</strong> VEPTR/TGR was used mostly before 2014 (median index year 2011) and MCGR mostly after (2018),
          while registry-wide UPROR fell from 39% before 2010 to 16% from 2016. Adjusted for year of surgery, the VEPTR/TGR vs MCGR
          difference was not significant (OR 1.27, 95% CI 0.94–1.72).
        </div>
      )}
    </section>
  );
}

function Breakdown({ res, values }) {
  if (!res.ok) return null;
  const maxD = Math.max(...res.dist);
  const top = res.drivers.filter((d) => d.gain > 0).slice(0, 3);
  const a = profile(res.best), b = profile(res.second);
  const show = (k, v) => (k === "ambulatory_ord" ? ({ 1: "Ambulatory", 0.5: "Limited", 0: "Non-amb." }[v] ?? "–")
    : fmt(v, k === "asa" || k === "n_comorbidities" ? 0 : 1));
  return (
    <section className="panel" aria-labelledby="why">
      <div className="panel-head"><div>
        <h2 id="why">Why this phenotype</h2>
        <p className="sub">Mean Gower distance to each registry phenotype, based on {res.observed} of 9 variables. Lower is closer.</p>
      </div></div>
      <div className="why-grid">
      <div className="dist">
        {[1, 2, 3].map((k) => (
          <div className={`dist-row${k === res.best ? " best" : ""}`} key={k}>
            <span className="dist-name">{PHENOTYPES[k].name}</span>
            <span className="dist-track"><span className={`dist-bar ph-${k}`} style={{ width: `${(100 * res.dist[k - 1] / maxD).toFixed(1)}%` }} /></span>
            <span className="dist-val">{fmt(res.dist[k - 1], 3)}</span>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <table className="tbl">
          <caption>Variables that most separated it from {PHENOTYPES[res.second].name}</caption>
          <thead><tr><th>Variable</th><th className="r">Patient</th><th className="r">{PHENOTYPES[res.best].name}</th><th className="r">{PHENOTYPES[res.second].name}</th></tr></thead>
          <tbody>
            {top.map((d) => (
              <tr key={d.key}>
                <td>{byKey[d.key].label}</td>
                <td className="r">{show(d.key, values[d.key] === "" ? null : +values[d.key])}</td>
                <td className="r">{show(d.key, a[d.key])}</td>
                <td className="r">{show(d.key, b[d.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
      <p className="fine">Phenotype columns show registry medians.</p>
    </section>
  );
}

const INFO = {
  when: (
    <ul>
      <li>Children with early-onset scoliosis (onset before age 10) being considered for a first surgical procedure.</li>
      <li>Preoperative counseling, when discussing expected two-year complication, reoperation and quality-of-life outcomes.</li>
      <li>Research and registry benchmarking by patient phenotype.</li>
    </ul>
  ),
  why: (
    <p>Early-onset scoliosis is heterogeneous, and pooled complication rates rarely describe the child in front of you. Grouping patients by
      data-driven phenotype and planned strategy gives families and surgeons outcome figures from children who looked like theirs and were
      treated in a similar way.</p>
  ),
};

export default function App() {
  const [values, setValues] = useState(EMPTY);
  const [plan, setPlan] = useState({ implant: "mcgr", traction: false, pelvis: false });
  const [tab, setTab] = useState("when");
  const onChange = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const bmi = useMemo(() => bmiFrom(values), [values]);
  const modelValues = useMemo(() => ({ ...values, bmi: bmi == null ? "" : bmi.toFixed(2) }), [values, bmi]);
  const res = useMemo(() => classify(modelValues), [modelValues]);
  const S = strategyFromPlan(plan);

  return (
    <div className="site">
      <header className="masthead">
        <div className="container mast-inner">
          <a href="#top" className="brand"><Logo /><span className="wordmark">EOS<b>Atlas</b></span></a>
          <nav aria-label="Primary">
            <a href="#calculator">Calculator</a>
            <a href="#about">About</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <div className="container">
          <div className="crumbs">Orthopaedics <span>/</span> Pediatric spine</div>
          <h1>Early-Onset Scoliosis Phenotype &amp; Outcomes</h1>
          <p className="lede">Classifies a child with early-onset scoliosis into one of three registry phenotypes and reports two-year
            outcomes by planned surgical strategy.</p>

          <div className="info">
            <div className="info-tabs" role="tablist">
              {[["when", "When to use"], ["why", "Why use"]].map(([k, l]) => (
                <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? "on" : ""}
                  onClick={() => setTab(tab === k ? null : k)}>{l}</button>
              ))}
            </div>
            {tab && <div className="info-body" role="tabpanel">{INFO[tab]}</div>}
          </div>

          <div className="calc" id="calculator">
            <form className="form" onSubmit={(e) => e.preventDefault()}>
              {GROUPS.map((g) => (
                <fieldset key={g.title}>
                  <legend>{g.title}</legend>
                  {g.keys.map((k) => k === "height" ? <HeightRow key={k} values={values} onChange={onChange} />
                    : k === "weight" ? <WeightRow key={k} values={values} onChange={onChange} bmi={bmi} />
                    : <InputRow key={k} f={byKey[k]} value={values[k]} onChange={onChange} />)}
                </fieldset>
              ))}
              <fieldset>
                <legend>Planned surgery</legend>
                <PlanRows plan={plan} setPlan={setPlan} />
                <div className="strategy-line">
                  Strategy cluster: <strong>{STRATEGIES[S].name}</strong> <span>— {STRATEGIES[S].desc}</span>
                </div>
              </fieldset>
              <div className="form-actions">
                <button type="button" className="link" onClick={() => setValues(EXAMPLE)}>Load example patient</button>
                <button type="button" className="link" onClick={() => setValues(EMPTY)}>Reset</button>
              </div>
            </form>

            <div className="side"><ResultPanel res={res} S={S} /></div>
          </div>

          <div className="below">
            <Compare res={res} S={S} />
            <Breakdown res={res} values={modelValues} />
          </div>

          <section className="about" id="about">
            <h2>About</h2>
            <p>EOS Atlas is a research tool from the PSSG0379 cluster analysis. It ships only aggregate registry parameters; no patient-level
              data are stored or transmitted, and all calculation happens in your browser.</p>
            <p className="disclaimer"><strong>For research and educational use.</strong> Not externally validated and not a medical device.
              Results describe outcomes in a registry cohort and should inform discussion, not determine treatment.</p>
          </section>
        </div>
      </main>

      <footer className="foot">
        <div className="container foot-inner">
          <span className="brand small"><Logo size={20} /><span className="wordmark">EOS<b>Atlas</b></span></span>
          <span>Version 1.0 · Registry data 1997–2023</span>
        </div>
      </footer>
      <MobileBar res={res} />
    </div>
  );
}
