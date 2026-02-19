/* =========================
   Brand Lift Survey Prototype
   - vanilla JS
   - localStorage state
========================= */

const LS_KEYS = {
  selectedCampaigns: "bl_selected_campaigns",
  draftStudy: "bl_draft_study",
  createdStudy: "bl_created_study",
};

const seededStudies = [
  {
    id: "st_1001",
    name: "Microsoft Brand Lift — Holiday 2025",
    status: "Completed",
    campaigns: ["Microsoft Advertising - Brand Awareness Display 2026"],
    start: "2025-11-03",
    end: "2025-11-30",
    country: "United States",
  },
  {
    id: "st_1002",
    name: "Microsoft Brand Lift — December 2025",
    status: "Completed",
    campaigns: ["Microsoft Advertising - Brand Awareness Display 2026"],
    start: "2025-12-01",
    end: "2025-12-28",
    country: "United States",
  },
  {
    id: "st_1003",
    name: "Microsoft Brand Lift — January 2026",
    status: "Completed",
    campaigns: ["Microsoft Advertising - Brand Awareness Display 2026"],
    start: "2026-01-05",
    end: "2026-02-01",
    country: "United States",
  },
  {
    id: "st_1004",
    name: "Microsoft Brand Lift — Display Feb 2026",
    status: "Ongoing",
    campaigns: ["Microsoft Advertising - Brand Awareness Display 2026"],
    start: "2026-02-07",
    end: "2026-03-06",
    country: "United States",
  },
];

const campaignsSeed = [
  {
    id: "c_2001",
    name: "Microsoft Advertising - Brand Awareness Display 2026",
    type: "Display",
    status: "Enabled",
    budget: 500.0,
    eligibility: "Eligible",
    selectable: true,
  },
  {
    id: "c_2002",
    name: "Microsoft Advertising - Brand Awareness Native 2026",
    type: "Native",
    status: "Enabled",
    budget: 300.0,
    eligibility: "Eligible",
    selectable: true,
  },
  {
    id: "c_2003",
    name: "Microsoft Advertising - Brand Awareness Display 2025",
    type: "Display",
    status: "Disabled",
    budget: 500.0,
    eligibility: "Ineligible",
    selectable: false,
  },
  {
    id: "c_2004",
    name: "Microsoft Advertising - Brand Awareness Native 2025",
    type: "Native",
    status: "Disabled",
    budget: 300.0,
    eligibility: "Ineligible",
    selectable: false,
  },
];

const favorabilityChoicePool = [
  "First-party only",
  "Third-party only",
  "Hybrid (both)",
  "No Strong preference",
];

const aidedChoicePool = [
  "Kantar",
  "Nielsen",
  "Ipsos",
  "Dynata",
  "First-party platform solution",
  "Other",
];

function $(id) {
  return document.getElementById(id);
}

function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDateMMDDYYYY(iso) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${mm}/${dd}/${y}`;
}

function safeJSONParse(v, fallback) {
  try {
    if (!v) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function getSelectedCampaignIds() {
  return safeJSONParse(localStorage.getItem(LS_KEYS.selectedCampaigns), []);
}

function setSelectedCampaignIds(ids) {
  localStorage.setItem(LS_KEYS.selectedCampaigns, JSON.stringify(ids));
}

function clearDraft() {
  localStorage.removeItem(LS_KEYS.selectedCampaigns);
  localStorage.removeItem(LS_KEYS.draftStudy);
}

function getSelectedCampaignObjects() {
  const ids = new Set(getSelectedCampaignIds());
  return campaignsSeed.filter((c) => ids.has(c.id));
}

/* =========================
   Page 1: Studies list
========================= */
function renderStudiesPage() {
  const tbody = $("studiesTbody");
  if (!tbody) return;

  const statusFilter = $("filterStatus");
  const countryFilter = $("filterCountry");
  const nameFilter = $("filterName");
  const goCreate = $("goCreate");

  const allStudies = seededStudies;

  function applyFilters() {
    const s = (statusFilter?.value || "all").toLowerCase();
    const c = countryFilter?.value || "all";
    const q = (nameFilter?.value || "").trim().toLowerCase();

    let rows = allStudies.slice();

    if (s !== "all") {
      rows = rows.filter((r) => r.status.toLowerCase() === s);
    }
    if (c !== "all") {
      rows = rows.filter((r) => r.country === c);
    }
    if (q) {
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

    tbody.innerHTML = rows
      .map((st) => {
        const pillClass = st.status === "Completed" ? "pill--completed" : "pill--ongoing";
        const dates = `${formatDateMMDDYYYY(st.start)} - ${formatDateMMDDYYYY(st.end)}`;
        const campaigns = st.campaigns.join(", ");

        return `
          <tr>
            <td><a class="link" href="#" onclick="return false;" title="Prototype link">${escapeHtml(st.name)}</a></td>
            <td><span class="pill ${pillClass}">${escapeHtml(st.status)}</span></td>
            <td class="truncate" title="${escapeHtml(campaigns)}">${escapeHtml(campaigns)}</td>
            <td>${dates}</td>
            <td>${escapeHtml(st.country)}</td>
            <td class="col-actions">
              <button class="icon-btn" disabled title="Edit (prototype)">✎</button>
              <button class="icon-btn" disabled title="Delete (prototype)">🗑</button>
            </td>
          </tr>
        `;
      })
      .join("");

    const count = $("studiesCount");
    if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "study" : "studies"}`;
  }

  statusFilter?.addEventListener("change", applyFilters);
  countryFilter?.addEventListener("change", applyFilters);
  nameFilter?.addEventListener("input", applyFilters);

  goCreate?.addEventListener("click", () => {
    clearDraft();
    window.location.href = "./create-study.html";
  });

  applyFilters();
}

/* =========================
   Page 2: Campaign selection
========================= */
function renderCampaignSelectionPage() {
  const tbody = $("campaignsTbody");
  if (!tbody) return;

  const search = $("campaignSearch");
  const nextBtn = $("nextToForm");
  const backBtn = $("backToList");
  const cancelBtn = $("cancelCreate");
  const selectAll = $("selectAllEligible");

  function renderRows() {
    const q = (search?.value || "").trim().toLowerCase();
    const selected = new Set(getSelectedCampaignIds());

    const rows = campaignsSeed
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => {
        const disabled = !c.selectable;
        const checked = selected.has(c.id);

        const rowClass = disabled ? "row-disabled" : "";
        const checkbox = disabled
          ? `<input type="checkbox" class="checkbox" disabled aria-label="Ineligible campaign" />`
          : `<input type="checkbox" class="checkbox" data-cid="${c.id}" ${checked ? "checked" : ""} aria-label="Select campaign" />`;

        const statusDot = c.status === "Enabled" ? "●" : "‖";
        const dotClass = c.status === "Enabled" ? "dot dot--on" : "dot dot--off";

        return `
          <tr class="${rowClass}">
            <td>${checkbox}</td>
            <td>
              <div class="cell-flex">
                <span class="${dotClass}" aria-hidden="true">${statusDot}</span>
                <span class="truncate" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
              </div>
            </td>
            <td>${escapeHtml(c.type)}</td>
            <td>${escapeHtml(c.status)}</td>
            <td>${money(c.budget)}</td>
            <td>${escapeHtml(c.eligibility)}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;

    // wire checkbox listeners
    tbody.querySelectorAll('input[type="checkbox"][data-cid]').forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-cid");
        const ids = new Set(getSelectedCampaignIds());
        if (e.target.checked) ids.add(id);
        else ids.delete(id);
        setSelectedCampaignIds([...ids]);
        updateSummary();
        updateSelectAll();
      });
    });

    updateSelectAll();
  }

  function updateSelectAll() {
    if (!selectAll) return;
    const eligible = campaignsSeed.filter((c) => c.selectable).map((c) => c.id);
    const ids = new Set(getSelectedCampaignIds());
    const allChecked = eligible.length > 0 && eligible.every((id) => ids.has(id));
    const noneChecked = eligible.every((id) => !ids.has(id));
    selectAll.indeterminate = !allChecked && !noneChecked;
    selectAll.checked = allChecked;
  }

  function updateSummary() {
    const selectedCampaigns = getSelectedCampaignObjects();
    const total = selectedCampaigns.reduce((sum, c) => sum + c.budget, 0);

    const totalEl = $("totalBudget");
    const countEl = $("selectedCount");
    const chips = $("selectedCampaignChips");

    if (totalEl) totalEl.textContent = money(total);
    if (countEl) countEl.textContent = `${selectedCampaigns.length} ${selectedCampaigns.length === 1 ? "campaign" : "campaigns"}`;

    if (chips) {
      chips.innerHTML = selectedCampaigns
        .map(
          (c) => `
            <div class="chip">
              <span class="truncate" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
              <button class="chip__x" data-remove="${c.id}" aria-label="Remove campaign">×</button>
            </div>
          `
        )
        .join("");

      chips.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-remove");
          const ids = new Set(getSelectedCampaignIds());
          ids.delete(id);
          setSelectedCampaignIds([...ids]);
          renderRows();
          updateSummary();
        });
      });
    }

    if (nextBtn) nextBtn.disabled = selectedCampaigns.length === 0;
  }

  search?.addEventListener("input", renderRows);

  selectAll?.addEventListener("change", (e) => {
    const eligibleIds = campaignsSeed.filter((c) => c.selectable).map((c) => c.id);
    if (e.target.checked) {
      setSelectedCampaignIds(eligibleIds);
    } else {
      setSelectedCampaignIds([]);
    }
    renderRows();
    updateSummary();
  });

  nextBtn?.addEventListener("click", () => {
    window.location.href = "./create-your-study.html";
  });

  backBtn?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  cancelBtn?.addEventListener("click", () => {
    clearDraft();
    window.location.href = "./index.html";
  });

  renderRows();
  updateSummary();
}

/* =========================
   Page 3: Create your study
========================= */
function renderStudyFormPage() {
  const campaignsWrap = $("chosenCampaigns");
  if (!campaignsWrap) return;

  const selected = getSelectedCampaignObjects();
  const fallback = $("campaignsFallback");

  if (!selected.length) {
    campaignsWrap.innerHTML = "";
    if (fallback) fallback.style.display = "block";
  } else {
    if (fallback) fallback.style.display = "none";
    campaignsWrap.innerHTML = selected
      .map((c) => `<div class="chip"><span class="truncate" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span></div>`)
      .join("");
  }

  // init date: today, min today
  const startDate = $("startDate");
  const todayIso = new Date();
  const todayStr = toISODate(todayIso);

  if (startDate) {
    startDate.min = todayStr;
    startDate.value = todayStr;
  }

  // template behavior
  const template = $("template");
  const builder = $("awarenessBuilder");
  const notSupported = $("templateNotSupported");

  function applyTemplate() {
    const v = template?.value || "Awareness";
    const isAwareness = v === "Awareness";
    if (builder) builder.style.display = isAwareness ? "block" : "none";
    if (notSupported) notSupported.style.display = isAwareness ? "none" : "flex";
  }
  template?.addEventListener("change", applyTemplate);
  applyTemplate();

  // choices logic
  const favBtn = $("addFavChoice");
  const aidedBtn = $("addAidedChoice");
  const favList = $("favChoices");
  const aidedList = $("aidedChoices");

  // start with empty; user clicks to add in the requested order
  let favIndex = 0;
  let aidedIndex = 0;

  function renderChoiceRow(text, container, onRemove) {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.innerHTML = `
      <div class="truncate" style="flex:1" title="${escapeHtml(text)}">${escapeHtml(text)}</div>
      <button class="chip__x" type="button" aria-label="Remove choice">×</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      onRemove();
      row.remove();
    });
    container.appendChild(row);
  }

  favBtn?.addEventListener("click", () => {
    if (!favList || favIndex >= favorabilityChoicePool.length) return;
    const value = favorabilityChoicePool[favIndex++];
    renderChoiceRow(value, favList, () => {
      // allow re-adding by stepping back only if removing the last added; keep simple for prototype:
      // we’ll just re-enable the button when below max, without reordering pool.
      // (prototype behavior)
    });
    if (favIndex >= favorabilityChoicePool.length) favBtn.disabled = true;
  });

  aidedBtn?.addEventListener("click", () => {
    if (!aidedList || aidedIndex >= aidedChoicePool.length) return;
    const value = aidedChoicePool[aidedIndex++];
    renderChoiceRow(value, aidedList, () => {});
    if (aidedIndex >= aidedChoicePool.length) aidedBtn.disabled = true;
  });

  // Back / Cancel
  $("backToCampaigns")?.addEventListener("click", () => {
    window.location.href = "./create-study.html";
  });

  $("cancelToList")?.addEventListener("click", () => {
    clearDraft();
    window.location.href = "./index.html";
  });

  // Save
  $("saveStudy")?.addEventListener("click", () => {
    const name = ($("studyName")?.value || "").trim();
    const date = $("startDate")?.value || "";
    const country = $("country")?.value || "United States";
    const tmpl = $("template")?.value || "Awareness";

    const errName = $("errName");
    const errDate = $("errDate");

    let ok = true;

    if (!name) {
      ok = false;
      if (errName) errName.hidden = false;
    } else if (errName) {
      errName.hidden = true;
    }

    if (!date || date < todayStr) {
      ok = false;
      if (errDate) errDate.hidden = false;
    } else if (errDate) {
      errDate.hidden = true;
    }

    if (!selected.length) ok = false;

    const qUnaided = ($("qUnaided")?.value || "").trim();
    const qFav = ($("qFavorability")?.value || "").trim();
    const qAided = ($("qAided")?.value || "").trim();

    const favChoices = favList ? Array.from(favList.querySelectorAll(".choice-row > div")).map((d) => d.textContent.trim()) : [];
    const aidedChoices = aidedList ? Array.from(aidedList.querySelectorAll(".choice-row > div")).map((d) => d.textContent.trim()) : [];

    const payload = {
      studyName: name,
      startDate: date,
      country,
      template: tmpl,
      campaigns: selected.map((c) => c.name),
      survey: {
        unaided: { question: qUnaided },
        favorability: { question: qFav, choices: favChoices },
        aided: { question: qAided, choices: aidedChoices },
      },
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(LS_KEYS.createdStudy, JSON.stringify(payload));
    window.location.href = "./confirmation.html";
  });
}

/* =========================
   Confirmation page
========================= */
function renderConfirmationPage() {
  const title = $("confTitle");
  if (!title) return;

  const payload = safeJSONParse(localStorage.getItem(LS_KEYS.createdStudy), null);
  if (!payload) {
    window.location.href = "./index.html";
    return;
  }

  $("confName").textContent = payload.studyName || "—";
  $("confStart").textContent = payload.startDate ? formatDateMMDDYYYY(payload.startDate) : "—";
  $("confCountry").textContent = payload.country || "—";
  $("confTemplate").textContent = payload.template || "—";
  title.textContent = payload.studyName || "Brand Lift Study";

  const campWrap = $("confCampaigns");
  if (campWrap) {
    campWrap.innerHTML = (payload.campaigns || [])
      .map((n) => `<div class="chip"><span class="truncate" title="${escapeHtml(n)}">${escapeHtml(n)}</span></div>`)
      .join("");
  }

  $("confQUnaided").textContent = payload.survey?.unaided?.question || "—";
  $("confQFav").textContent = payload.survey?.favorability?.question || "—";
  $("confQAided").textContent = payload.survey?.aided?.question || "—";

  const fav = $("confFavChoices");
  if (fav) {
    fav.innerHTML = (payload.survey?.favorability?.choices || [])
      .map((c) => `<div class="chip"><span>${escapeHtml(c)}</span></div>`)
      .join("");
  }

  const aided = $("confAidedChoices");
  if (aided) {
    aided.innerHTML = (payload.survey?.aided?.choices || [])
      .map((c) => `<div class="chip"><span>${escapeHtml(c)}</span></div>`)
      .join("");
  }

  $("createAnother")?.addEventListener("click", () => {
    clearDraft();
    window.location.href = "./create-study.html";
  });

  $("backToListFromConf")?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

/* =========================
   Helpers
========================= */
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Small extra CSS hooks via JS (status dot, truncation, link) */
(function injectSmallCSS() {
  const css = `
    .dot{font-size:12px;margin-right:8px}
    .dot--on{color:#107c10}
    .dot--off{color:#a19f9d}
    .cell-flex{display:flex;align-items:center;gap:8px}
    .truncate{max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block}
    .link{color:var(--primary);text-decoration:none;border-bottom:1px solid transparent}
    .link:hover{border-bottom-color:var(--primary)}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", () => {
  renderStudiesPage();
  renderCampaignSelectionPage();
  renderStudyFormPage();
  renderConfirmationPage();
});
