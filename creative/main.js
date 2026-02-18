const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxPDl2U7iAsaLCL0MR-gXm_Ia8yRqzDZNhNiZoAckJbrO7emGVzqsE98z3NaWL3KOCqlA/exec";
const TOKEN = "LennyBLS123"; // optionnel

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getClickUrl() {
  return (
    new URLSearchParams(window.location.search).get("clickTag") ||
    window.clickTag ||
    "https://www.microsoft.com"
  );
}

function setStatus(el, msg, isError = false) {
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "";
}

function sanitize(str) {
  return String(str || "").trim().slice(0, 120);
}

function sendBeaconGet(paramsObj) {
  const params = new URLSearchParams(paramsObj);
  const img = new Image();
  img.src = `${APPS_SCRIPT_URL}?${params.toString()}`;
}

(function init() {
  const form = document.getElementById("surveyForm");
  const sendBtn = document.getElementById("sendBtn");
  const status = document.getElementById("status");
  const thankYou = document.getElementById("thankYou");
  const ctaClick = document.getElementById("ctaClick");

  ctaClick.addEventListener("click", () => {
    window.open(getClickUrl(), "_blank");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const q1 = sanitize(document.getElementById("q1").value);
    const q2 = sanitize(document.getElementById("q2").value);
    const q3 = sanitize(document.getElementById("q3").value);

    if (!q1 || !q2 || !q3) {
      setStatus(status, "Merci de remplir les 3 réponses.", true);
      return;
    }

    sendBtn.disabled = true;
    setStatus(status, "Envoi en cours…");

    const payload = {
      ts: new Date().toISOString(),
      cid: qs("cid") || "",
      crid: qs("crid") || "",
      q1,
      q2,
      q3,
      ua: navigator.userAgent,
      t: TOKEN
    };

    try {
      sendBeaconGet(payload);
      setStatus(status, "");
      form.hidden = true;
      thankYou.hidden = false;
    } catch (err) {
      console.error(err);
      setStatus(status, "Échec de l’envoi. Réessaie.", true);
      sendBtn.disabled = false;
    }
  });
})();
