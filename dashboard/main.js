// Google Sheets CSV export URL (no auth required if the sheet is shared / published)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSh01ccfdoMhKLf04m30buSVkBUtNzX7Zk3UXb9Ft7or2HteK_VKDei4VHsisT8nXSr8W7AjBIN4D0j/pub?output=csv";

const CID_CONTROL = "31150957";
const CID_TEST = "31150960";

const Q1_PROVIDERS = ["Kantar", "Nielsen", "Ipsos", "Dynata", "First-party", "Other"];
const Q2_OPTIONS = ["First-party", "Third-party", "Hybrid", "No preference"];

const Q3_THEMES = [
  { name: "Awareness", keywords: ["awareness", "brand awareness"] },
  { name: "Ad Recall", keywords: ["recall", "ad recall", "message association"] },
  { name: "Consideration", keywords: ["consideration"] },
  { name: "Purchase Intent", keywords: ["purchase", "intent"] },
  { name: "Incremental Reach", keywords: ["incremental", "reach"] },
  { name: "Cross-channel Impact", keywords: ["cross-channel", "cross channel", "omnichannel"] }
];

// ====== CHART HANDLES ======
let q2DistChart, q2LiftChart, q1LiftChart, q3ThemesChart;

// ====== UTIL ======
const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

function formatPct(x) { return (x * 100).toFixed(1) + "%"; }
function formatPP(x) {
  const pp = x * 100;
  const sign = pp > 0 ? "+" : "";
  return sign + pp.toFixed(1) + " pp";
}
function formatPValue(p) {
  if (p < 0.0001) return "<0.0001";
  return p.toFixed(4);
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  prob = 1 - prob;
  return x >= 0 ? prob : 1 - prob;
}

function twoPropDiffCI(p1, n1, p0, n0, z = 1.96) {
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0);
  const diff = p1 - p0;
  return { diff, lo: diff - z * se, hi: diff + z * se, se };
}

function twoPropZTest(p1, n1, p0, n0) {
  const x1 = p1 * n1;
  const x0 = p0 * n0;
  const p = (x1 + x0) / (n1 + n0);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n0));
  if (se === 0) return { z: 0, p: 1 };
  const z = (p1 - p0) / se;
  const pval = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p: pval };
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"' && inQuotes && next === '"') { cur += '"'; i++; }
    else if (c === '"') { inQuotes = !inQuotes; }
    else if (c === "," && !inQuotes) { row.push(cur); cur = ""; }
    else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cur = "";
    } else { cur += c; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }

  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.length && r.some(x => (x || "").trim().length))
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

function extractThemes(q3) {
  const t = (q3 || "").toLowerCase();
  const hits = new Set();
  for (const theme of Q3_THEMES) {
    for (const kw of theme.keywords) {
      if (t.includes(kw.toLowerCase())) { hits.add(theme.name); break; }
    }
  }
  return hits.size ? Array.from(hits) : ["Other / Unclassified"];
}

function destroyChart(ch) { if (ch) ch.destroy(); }

// ====== METRICS ======
function computeDistributions(rowsControl, rowsTest) {
  const n0 = rowsControl.length;
  const n1 = rowsTest.length;

  const q2Count = (rows) => {
    const m = Object.fromEntries(Q2_OPTIONS.map(x => [x, 0]));
    for (const r of rows) {
      const v = (r.q2 || "").trim();
      if (m[v] != null) m[v] += 1;
    }
    return m;
  };

  const q1Rate = (rows) => {
    const counts = Object.fromEntries(Q1_PROVIDERS.map(p => [p, 0]));
    for (const r of rows) {
      const selected = new Set(normalizeQ1(r.q1));
      for (const p of Q1_PROVIDERS) if (selected.has(p)) counts[p] += 1;
    }
    return counts;
  };

  const themeCounts = (rows) => {
    const m = {};
    for (const r of rows) {
      for (const th of extractThemes(r.q3)) m[th] = (m[th] || 0) + 1;
    }
    return m;
  };

  return {
    n0, n1,
    q2Control: q2Count(rowsControl),
    q2Test: q2Count(rowsTest),
    q1Control: q1Rate(rowsControl),
    q1Test: q1Rate(rowsTest),
    q3Control: themeCounts(rowsControl),
    q3Test: themeCounts(rowsTest),
  };
}

function metricRow(name, p0, n0, p1, n1) {
  const ci = twoPropDiffCI(p1, n1, p0, n0);
  const zt = twoPropZTest(p1, n1, p0, n0);
  return { name, control: p0, test: p1, lift: ci.diff, ciLo: ci.lo, ciHi: ci.hi, p: zt.p };
}

// ====== RENDER ======
function renderSummary(dist) {
  const el = $("summaryCards");
  if (!el) return;

  const { n0, n1 } = dist;
  const p = (x, n) => n ? x / n : 0;

  const q2fp0 = p(dist.q2Control["First-party"], n0);
  const q2fp1 = p(dist.q2Test["First-party"], n1);

  const q2hy0 = p(dist.q2Control["Hybrid"], n0);
  const q2hy1 = p(dist.q2Test["Hybrid"], n1);

  const q1ka0 = p(dist.q1Control["Kantar"], n0);
  const q1ka1 = p(dist.q1Test["Kantar"], n1);

  const q1fp0 = p(dist.q1Control["First-party"], n0);
  const q1fp1 = p(dist.q1Test["First-party"], n1);

  const highlight = [
    { label: "Sample size (Control)", value: String(n0), small: `cid=${CID_CONTROL}` },
    { label: "Sample size (Test)", value: String(n1), small: `cid=${CID_TEST}` },
    { label: "Lift · Q2 First-party", value: formatPP(q2fp1 - q2fp0), small: `${formatPct(q2fp0)} → ${formatPct(q2fp1)}` },
    { label: "Lift · Q1 Kantar", value: formatPP(q1ka1 - q1ka0), small: `${formatPct(q1ka0)} → ${formatPct(q1ka1)}` },
    { label: "Lift · Q2 Hybrid", value: formatPP(q2hy1 - q2hy0), small: `${formatPct(q2hy0)} → ${formatPct(q2hy1)}` },
    { label: "Lift · Q1 First-party", value: formatPP(q1fp1 - q1fp0), small: `${formatPct(q1fp0)} → ${formatPct(q1fp1)}` },
  ];

  el.innerHTML = highlight.map(c => `
    <div class="card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="small">${c.small}</div>
    </div>
  `).join("");
}

function renderTable(rows) {
  const table = $("metricsTable");
  if (!table) return;
  let tbody = table.querySelector("tbody");
  if (!tbody) { tbody = document.createElement("tbody"); table.appendChild(tbody); }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${formatPct(r.control)}</td>
      <td>${formatPct(r.test)}</td>
      <td>${formatPP(r.lift)}</td>
      <td>${formatPP(r.ciLo)} to ${formatPP(r.ciHi)}</td>
      <td>${formatPValue(r.p)}</td>
    </tr>
  `).join("");
}

function renderRecommendations(metricRows) {
  const el = $("reco");
  if (!el) return;

  const sig = metricRows
    .filter(r => r.p < 0.05)
    .sort((a,b) => Math.abs(b.lift) - Math.abs(a.lift))
    .slice(0, 4);

  if (!sig.length) {
    el.innerHTML = `<div class="reco-item"><h4>No statistically significant lifts</h4><p>Increase sample size and/or refine targeting for stronger signal.</p></div>`;
    return;
  }

  el.innerHTML = sig.map(r => {
    const direction = r.lift >= 0 ? "increased" : "decreased";
    const magnitude = formatPP(r.lift);
    return `
      <div class="reco-item">
        <h4>${r.name}: ${magnitude} (${direction})</h4>
        <p>
          Test differs from Control by <b>${magnitude}</b> (95% CI ${formatPP(r.ciLo)} to ${formatPP(r.ciHi)}, p=${formatPValue(r.p)}).
          Consider aligning messaging and measurement packaging to reinforce this preference.
        </p>
      </div>
    `;
  }).join("");
}

function renderCharts(dist) {
  const { n0, n1 } = dist;

  const q2Labels = Q2_OPTIONS;
  const q2ControlPct = q2Labels.map(k => dist.q2Control[k] / n0);
  const q2TestPct = q2Labels.map(k => dist.q2Test[k] / n1);

  destroyChart(q2DistChart);
  q2DistChart = new Chart($("q2DistChart"), {
    type: "bar",
    data: {
      labels: q2Labels,
      datasets: [
        { label: "Control", data: q2ControlPct },
        { label: "Test", data: q2TestPct }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#111827" } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.raw*100).toFixed(1)}%` } }
      },
      scales: {
        x: { ticks: { color: "#111827" }, grid: { color: "rgba(0,0,0,.06)" } },
        y: { ticks: { color: "#111827", callback: v => (v*100) + "%" }, grid: { color: "rgba(0,0,0,.06)" }, suggestedMax: 1 }
      }
    }
  });

  $("q2Foot").textContent = `n(Control)=${n0}, n(Test)=${n1}.`;

  const q2Lift = q2Labels.map(k => (dist.q2Test[k]/n1) - (dist.q2Control[k]/n0));
  destroyChart(q2LiftChart);
  q2LiftChart = new Chart($("q2LiftChart"), {
    type: "bar",
    data: { labels: q2Labels, datasets: [{ label: "Lift (Test − Control)", data: q2Lift }] },
    options: {
      plugins: { legend: { labels: { color: "#111827" } } },
      scales: {
        x: { ticks: { color: "#111827" }, grid: { color: "rgba(0,0,0,.06)" } },
        y: { ticks: { color: "#111827", callback: v => (v*100).toFixed(0) + " pp" }, grid: { color: "rgba(0,0,0,.06)" } }
      }
    }
  });

  const q1Labels = Q1_PROVIDERS;
  const q1Lift = q1Labels.map(p => (dist.q1Test[p]/n1) - (dist.q1Control[p]/n0));
  destroyChart(q1LiftChart);
  q1LiftChart = new Chart($("q1LiftChart"), {
    type: "bar",
    data: { labels: q1Labels, datasets: [{ label: "Lift (Test − Control)", data: q1Lift }] },
    options: {
      plugins: { legend: { labels: { color: "#111827" } } },
      scales: {
        x: { ticks: { color: "#111827" }, grid: { color: "rgba(0,0,0,.06)" } },
        y: { ticks: { color: "#111827", callback: v => (v*100).toFixed(0) + " pp" }, grid: { color: "rgba(0,0,0,.06)" } }
      }
    }
  });

  $("q1Foot").textContent = `Q1 is multi-select; each provider is measured as selected vs not selected.`;

  const combined = {};
  for (const [k,v] of Object.entries(dist.q3Control)) combined[k] = (combined[k] || 0) + v;
  for (const [k,v] of Object.entries(dist.q3Test)) combined[k] = (combined[k] || 0) + v;

  const themeLabels = Object.entries(combined)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 7)
    .map(([k]) => k);

  const themeControl = themeLabels.map(k => dist.q3Control[k] || 0);
  const themeTest = themeLabels.map(k => dist.q3Test[k] || 0);

  destroyChart(q3ThemesChart);
  q3ThemesChart = new Chart($("q3ThemesChart"), {
    type: "bar",
    data: {
      labels: themeLabels,
      datasets: [
        { label: "Control", data: themeControl },
        { label: "Test", data: themeTest }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: "#111827" } } },
      scales: {
        x: { ticks: { color: "#111827" }, grid: { color: "rgba(0,0,0,.06)" } },
        y: { ticks: { color: "#111827" }, grid: { color: "rgba(0,0,0,.06)" } }
      }
    }
  });
}

function buildMetricRows(dist) {
  const { n0, n1 } = dist;
  const rows = [];

  for (const opt of Q2_OPTIONS) {
    const p0 = dist.q2Control[opt] / n0;
    const p1 = dist.q2Test[opt] / n1;
    rows.push(metricRow(`Q2 · ${opt}`, p0, n0, p1, n1));
  }

  for (const prov of Q1_PROVIDERS) {
    const p0 = dist.q1Control[prov] / n0;
    const p1 = dist.q1Test[prov] / n1;
    rows.push(metricRow(`Q1 · Selected ${prov}`, p0, n0, p1, n1));
  }

  return rows;
}

// ====== LOAD & RUN ======
async function loadAndRender() {
  setStatus("Loading data from Google Sheets…");

  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "cb=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status} ${res.statusText}`);

  const csvText = await res.text();
  const rows = parseCsv(csvText);

  const control = rows.filter(r => (r.cid || "").trim() === CID_CONTROL);
  const test = rows.filter(r => (r.cid || "").trim() === CID_TEST);

  if (!control.length || !test.length) {
    throw new Error(`Missing cohort data. Found control=${control.length}, test=${test.length}. Check cid values and sheet tab name.`);
  }

  const dist = computeDistributions(control, test);

  renderSummary(dist);

  const metricRows = buildMetricRows(dist);
  renderTable(metricRows);
  renderRecommendations(metricRows);
  renderCharts(dist);

  setStatus(`Loaded ${rows.length} rows. Control=${control.length}, Test=${test.length}.`);
}

$("refreshBtn").addEventListener("click", () => {
  loadAndRender().catch(err => {
    console.error(err);
    setStatus("Error: " + (err.message || String(err)));
  });
});

loadAndRender().catch(err => {
  console.error(err);
  setStatus("Error: " + (err.message || String(err)) + " (Check sheet sharing + tab name)");
});
