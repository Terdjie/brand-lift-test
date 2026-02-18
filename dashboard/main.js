// Google Sheets CSV export URL (no auth required if the sheet is shared / published)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSh01ccfdoMhKLf04m30buSVkBUtNzX7Zk3UXb9Ft7or2HteK_VKDei4VHsisT8nXSr8W7AjBIN4D0j/pub?output=csv";

// Cohorts
const CID_CONTROL = "31150957";
const CID_TREATMENT = "31150960"; // "Test" / exposed cohort

// Q1 providers tracked (multi-select stored as "Kantar, First-party, ...")
const Q1_PROVIDERS = ["Kantar", "Nielsen", "Ipsos", "Dynata", "First-party", "Other"];

// Q2 options (single-select)
const Q2_OPTIONS = ["First-party", "Third-party", "Hybrid", "No preference"];

// KPI mapping (Microsoft-like tiles)
const KPI_DEFS = [
  {
    key: "Search lift",
    metricName: "Q2 · First-party preference",
    computeBinary: (row) => (row.q2 || "").trim() === "First-party",
    ui: { kpi: "kpiSearch", control: "searchControl", treatment: "searchTreatment" }
  },
  {
    key: "Visit lift",
    metricName: "Q1 · Selected Kantar",
    computeBinary: (row) => normalizeQ1(row.q1).includes("Kantar"),
    ui: { kpi: "kpiVisit", control: "visitControl", treatment: "visitTreatment" }
  },
  {
    key: "Conversion lift",
    metricName: "Q2 · Hybrid preference",
    computeBinary: (row) => (row.q2 || "").trim() === "Hybrid",
    ui: { kpi: "kpiConversion", control: "convControl", treatment: "convTreatment" }
  }
];

// ====== DOM helpers ======
const $ = (id) => document.getElementById(id);
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}
function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

// ====== formatting ======
function pct(x) { return (x * 100).toFixed(2) + "%"; }
function pct0(x) { return (x * 100).toFixed(0) + "%"; }
function liftRel(pT, pC) {
  if (pC <= 0) return 0;
  return (pT - pC) / pC;
}
function formatLiftRel(l) {
  const s = l >= 0 ? "+" : "";
  return s + (l * 100).toFixed(0) + "%";
}
function formatPValue(p) {
  if (p < 0.0001) return "<0.0001";
  return p.toFixed(4);
}
function confidenceFromP(p) {
  // mimic “confidence level” feel (you can tune thresholds)
  if (p < 0.05) return "High";
  if (p < 0.10) return "Medium";
  return "Low";
}

// ====== stats ======
function normalCdf(x) {
  // A&S approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  prob = 1 - prob;
  return x >= 0 ? prob : 1 - prob;
}

function twoPropZTest(pT, nT, pC, nC) {
  // pooled under H0
  const xT = pT * nT;
  const xC = pC * nC;
  const p = (xT + xC) / (nT + nC);
  const se = Math.sqrt(p * (1 - p) * (1 / nT + 1 / nC));
  if (!isFinite(se) || se === 0) return { z: 0, p: 1 };
  const z = (pT - pC) / se;
  const pval = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p: pval };
}

function diffCI95(pT, nT, pC, nC) {
  // Wald CI on difference (good enough for prototype)
  const z = 1.96;
  const se = Math.sqrt((pT * (1 - pT)) / nT + (pC * (1 - pC)) / nC);
  const d = pT - pC;
  return { diff: d, lo: d - z * se, hi: d + z * se, se };
}

function relLiftCI95(pT, nT, pC, nC) {
  // Convert diff CI to relative lift CI: (pT - pC)/pC
  // This is an approximation but matches typical “lift %” reporting.
  const ci = diffCI95(pT, nT, pC, nC);
  if (pC <= 0) return { lift: 0, lo: 0, hi: 0 };
  return {
    lift: (pT - pC) / pC,
    lo: ci.lo / pC,
    hi: ci.hi / pC
  };
}

// ====== CSV parsing ======
function parseCsv(csvText) {
  // Robust CSV parser handling quoted commas
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(cur);
      cur = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      if (row.length > 1 || (row[0] || "").trim() !== "") rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  const header = (rows.shift() || []).map(h => (h || "").trim());
  return rows
    .filter(r => r.some(x => (x || "").trim().length))
    .map(r => {
      const obj = {};
      header.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
      return obj;
    });
}

function normalizeQ1(q1) {
  return (q1 || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

// ====== metrics computation ======
function rateBinary(rows, predicate) {
  const n = rows.length;
  let x = 0;
  for (const r of rows) if (predicate(r)) x++;
  return { n, x, p: n ? (x / n) : 0 };
}

function buildMetricRows(controlRows, treatmentRows) {
  const metrics = [];

  // Q2: each option is a binary metric
  for (const opt of Q2_OPTIONS) {
    const pred = (r) => (r.q2 || "").trim() === opt;
    metrics.push(makeMetric(`Q2 · ${opt}`, controlRows, treatmentRows, pred));
  }

  // Q1: each provider is a binary metric (selected vs not)
  for (const prov of Q1_PROVIDERS) {
    const pred = (r) => normalizeQ1(r.q1).includes(prov);
    metrics.push(makeMetric(`Q1 · Selected ${prov}`, controlRows, treatmentRows, pred));
  }

  return metrics;
}

function makeMetric(name, controlRows, treatmentRows, predicate) {
  const c = rateBinary(controlRows, predicate);
  const t = rateBinary(treatmentRows, predicate);

  const rel = liftRel(t.p, c.p);
  const ci = relLiftCI95(t.p, t.n, c.p, c.n);
  const zt = twoPropZTest(t.p, t.n, c.p, c.n);
  const conf = confidenceFromP(zt.p);

  return {
    name,
    controlP: c.p,
    treatmentP: t.p,
    relLift: rel,
    relLo: ci.lo,
    relHi: ci.hi,
    pValue: zt.p,
    confidence: conf
  };
}

// ====== rendering ======
function renderKPIs(controlRows, treatmentRows) {
  for (const kpi of KPI_DEFS) {
    const c = rateBinary(controlRows, kpi.computeBinary);
    const t = rateBinary(treatmentRows, kpi.computeBinary);

    const rel = liftRel(t.p, c.p);
    // Display like Microsoft cards: big number = lift %, rows = Treatment/Control rates
    setText(kpi.ui.kpi, formatLiftRel(rel));
    setText(kpi.ui.control, pct(c.p));
    setText(kpi.ui.treatment, pct(t.p));
  }
}

function renderTable(metricRows) {
  const table = document.getElementById("metricsTable");
  if (!table) return;

  let tbody = table.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  tbody.innerHTML = metricRows.map(m => {
    const confClass = (m.confidence || "Low").toLowerCase(); // high/medium/low
    const confBadge = `<span class="badge ${confClass}">${m.confidence}</span>`;
    return `
      <tr>
        <td>${m.name}</td>
        <td>${pct(m.controlP)}</td>
        <td>${pct(m.treatmentP)}</td>
        <td>${formatLiftRel(m.relLift)}</td>
        <td>${formatLiftRel(m.relLo)} to ${formatLiftRel(m.relHi)}</td>
        <td>${formatPValue(m.pValue)} ${confBadge}</td>
      </tr>
    `;
  }).join("");
}

// Optional: a short “platform-like” recommendations block if you have a div#reco
function renderRecommendations(metricRows) {
  const el = $("reco");
  if (!el) return;

  const sig = metricRows
    .filter(m => m.pValue < 0.05)
    .sort((a,b) => Math.abs(b.relLift) - Math.abs(a.relLift))
    .slice(0, 4);

  if (!sig.length) {
    el.innerHTML = `
      <div class="reco-item">
        <h4>No statistically significant lifts</h4>
        <p>Increase sample size and/or refine targeting to improve signal strength.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = sig.map(m => {
    const dir = m.relLift >= 0 ? "higher" : "lower";
    return `
      <div class="reco-item">
        <h4>${m.name}</h4>
        <p>
          Treatment shows <b>${formatLiftRel(m.relLift)}</b> ${dir} rate vs Control
          (95% CI ${formatLiftRel(m.relLo)} to ${formatLiftRel(m.relHi)}, p=${formatPValue(m.pValue)}, confidence: ${m.confidence}).
        </p>
      </div>
    `;
  }).join("");
}

// ====== load ======
async function loadCsvRows() {
  // cache buster helps while iterating on GitHub Pages
  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "cb=" + Date.now();

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseCsv(text);
}

async function loadAndRender() {
  setStatus("Loading data…");

  const rows = await loadCsvRows();

  // Normalize column names if needed (in case header casing differs)
  // Expecting: ts, cid, crid, q1, q2, q3
  const normalized = rows.map(r => ({
    ts: r.ts ?? r.TS ?? r.Timestamp ?? "",
    cid: r.cid ?? r.CID ?? "",
    crid: r.crid ?? r.CRID ?? "",
    q1: r.q1 ?? r.Q1 ?? "",
    q2: r.q2 ?? r.Q2 ?? "",
    q3: r.q3 ?? r.Q3 ?? ""
  }));

  const control = normalized.filter(r => (r.cid || "").trim() === CID_CONTROL);
  const treatment = normalized.filter(r => (r.cid || "").trim() === CID_TREATMENT);

  if (!control.length || !treatment.length) {
    throw new Error(
      `Missing cohort data. Control=${control.length}, Treatment=${treatment.length}. ` +
      `Check SHEET_TAB and cid values.`
    );
  }

  renderKPIs(control, treatment);

  const metricRows = buildMetricRows(control, treatment);
  renderTable(metricRows);
  renderRecommendations(metricRows);

  setStatus(`Loaded ${normalized.length} rows. Control=${control.length}, Treatment=${treatment.length}.`);
}

// Wire refresh button if present
const refreshBtn = $("refreshBtn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadAndRender().catch(err => {
      console.error(err);
      setStatus("Error: " + (err.message || String(err)));
    });
  });
}

// Initial load
loadAndRender().catch(err => {
  console.error(err);
  setStatus("Error: " + (err.message || String(err)) + " — If you see 'Failed to fetch', use Publish-to-web CSV URL.");
});
