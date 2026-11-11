/* The portal owns navigation and guidance; Swagger owns request execution/auth. */
(() => {
  "use strict";
  const config = JSON.parse(document.getElementById("docs-config").textContent);
  const $ = (selector) => document.querySelector(selector);
  const root = document.documentElement;
  const base = window.location.origin + config.basePath;
  const labels = {health:"Health checks",system:"System diagnostics",auth:"Authentication & profile",devices:"Chambers & telemetry",batches:"Production batches",access:"Workspace access",operator:"Operator management",superadmin:"Administration"};
  let operations = [], selectedTag = "", language = "curl", loading = false, toastTimer;
  let observer;
  const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const announce = (message) => {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => {$("#toast").hidden = true;},3500);
  };
  const scrollTo = (element) => element.scrollIntoView({behavior:prefersReducedMotion() ? "instant" : "smooth",block:"start"});

  function setTheme(theme) {
    root.dataset.theme = theme;
    $("#theme-toggle").setAttribute("aria-label",`Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    try {localStorage.setItem("sproutsync-docs-theme",theme);} catch { /* Storage may be disabled. */ }
  }
  let savedTheme;
  try {savedTheme = localStorage.getItem("sproutsync-docs-theme");} catch { /* Use browser preference. */ }
  setTheme(["light","dark"].includes(savedTheme) ? savedTheme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  $("#theme-toggle").addEventListener("click",() => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));

  function closeMenu() {
    root.classList.remove("navigation-open");
    $("#menu-toggle").setAttribute("aria-expanded","false");
    $("#menu-toggle").setAttribute("aria-label","Open documentation navigation");
  }
  let activeModal = null;
  function improveAuthDialog() {
    const modal = $("#swagger-ui .modal-ux");
    if (!modal) {activeModal = null; return;}
    modal.setAttribute("role","dialog"); modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-label","Authorize your Supabase session");
    const close = modal.querySelector(".close-modal");
    close?.setAttribute("aria-label","Close authorization");
    const input = modal.querySelector("input");
    if (input) {input.type = "password"; input.autocomplete = "off"; input.setAttribute("aria-label","Supabase session access token");}
    if (activeModal !== modal) {activeModal = modal; (input || close)?.focus();}
  }
  $("#menu-toggle").addEventListener("click",() => {
    const open = root.classList.toggle("navigation-open");
    $("#menu-toggle").setAttribute("aria-expanded",String(open));
    $("#menu-toggle").setAttribute("aria-label",`${open ? "Close" : "Open"} documentation navigation`);
  });
  $("#sidebar").addEventListener("click",event => {if (event.target.closest("a,button")) closeMenu();});
  document.addEventListener("click",event => {if (!event.target.closest("#sidebar,#menu-toggle")) closeMenu();});
  document.addEventListener("keydown",event => {
    const modal = $("#swagger-ui .modal-ux");
    if (modal && event.key === "Tab") {
      const controls = [...modal.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]")].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    }
    if (modal && event.key === "Escape") {
      event.preventDefault(); modal.querySelector(".close-modal")?.click();
      $("#swagger-ui .auth-wrapper > button.authorize")?.focus(); return;
    }
    if (event.key === "Escape" && root.classList.contains("navigation-open")) {closeMenu(); $("#menu-toggle").focus();}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {event.preventDefault(); scrollTo($("#api-reference")); $("#endpoint-search").focus({preventScroll:true});}
  });

  async function copy(text,message) {
    try {await navigator.clipboard.writeText(text); announce(message);}
    catch {announce("Clipboard unavailable. Select the text and copy it manually.");}
  }
  $("#base-url").textContent = base;
  $("#copy-base").addEventListener("click",() => copy(base,"Backend URL copied."));
  const examples = {
    curl:() => `curl '${base}/api/v1/devices/live' --header 'Authorization: Bearer YOUR_SESSION_TOKEN'`,
    javascript:() => `const response = await fetch(${JSON.stringify(base+"/api/v1/devices/live")}, {\n  headers: { Authorization: "Bearer YOUR_SESSION_TOKEN" }\n});\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst snapshot = await response.json();\nconsole.log(snapshot.latest_readings);`,
    python:() => `import json\nfrom urllib.request import Request, urlopen\n\nrequest = Request(\n    ${JSON.stringify(base+"/api/v1/devices/live")},\n    headers={"Authorization": "Bearer YOUR_SESSION_TOKEN"},\n)\nwith urlopen(request, timeout=10) as response:\n    snapshot = json.load(response)\nprint(snapshot["latest_readings"])`,
  };
  function showExample(nextLanguage) {
    language = nextLanguage;
    document.querySelectorAll("[data-language]").forEach(tab => {
      const selected = tab.dataset.language === language;
      tab.setAttribute("aria-selected",String(selected)); tab.tabIndex = selected ? 0 : -1;
    });
    $("#example-code").setAttribute("aria-labelledby",`tab-${language}`);
    $("#example-code code").textContent = examples[language]();
  }
  document.querySelectorAll("[data-language]").forEach(tab => {
    tab.addEventListener("click",() => showExample(tab.dataset.language));
    tab.addEventListener("keydown",event => {
      const tabs = [...document.querySelectorAll("[data-language]")];
      const direction = {ArrowRight:1,ArrowLeft:-1}[event.key];
      if (direction || ["Home","End"].includes(event.key)) {
        event.preventDefault();
        const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : (tabs.indexOf(tab)+direction+tabs.length)%tabs.length;
        showExample(tabs[index].dataset.language); tabs[index].focus();
      }
    });
  });
  $("#copy-example").addEventListener("click",() => copy(examples[language](),"Request example copied."));
  showExample(language);

  async function checkApi() {
    const button = $("#check-api");
    if (button.disabled) return;
    button.disabled = true; button.setAttribute("aria-busy","true");
    $("#check-caption").textContent = "Checking this backend. No device commands or record changes.";
    await Promise.all([ ["/api/v1/health","#health-state"], ["/api/v1/ready","#ready-state"] ].map(async ([path,id]) => {
      const badge = $(id); badge.dataset.state = "checking"; badge.textContent = "Checking";
      try {
        const response = await fetch(config.basePath+path,{cache:"no-store",signal:AbortSignal.timeout(8000)});
        const body = await response.json();
        const good = response.ok && ["ok","ready"].includes(body.status);
        badge.dataset.state = good ? "ok" : "attention";
        badge.textContent = good ? id === "#health-state" ? "Responding" : "Ready" : "Needs attention";
      } catch {badge.dataset.state = "error"; badge.textContent = "Unavailable";}
    }));
    button.disabled = false; button.removeAttribute("aria-busy");
    $("#check-caption").textContent = `Checked ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · Public checks only. Check chamber packets separately for device health.`;
  }
  $("#check-api").addEventListener("click",checkApi);
  void checkApi();

  const search = $("#endpoint-search"), methodFilter = $("#method-filter");
  const recordFor = (block) => {
    const path = block.querySelector(".opblock-summary-path")?.getAttribute("data-path") || block.querySelector(".opblock-summary-path")?.textContent.trim();
    const method = block.querySelector(".opblock-summary-method")?.textContent.trim().toLowerCase();
    return operations.find(op => op.path === path && op.method === method);
  };
  function matches(op) {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (!selectedTag || op.tags.includes(selectedTag)) && (methodFilter.value === "all" || op.method === methodFilter.value)
      && words.every(word => op.text.includes(word));
  }
  function applyFilters() {
    const nativeMain = $("#swagger-ui main");
    if (nativeMain) {nativeMain.setAttribute("role","region"); nativeMain.setAttribute("aria-label","Endpoint operations");}
    const count = operations.filter(matches).length;
    const message = `Showing ${count} of ${operations.length} endpoints`;
    if ($("#result-count").textContent !== message) $("#result-count").textContent = message;
    $("#no-results").hidden = count !== 0 || loading;
    $("#clear-filters").hidden = !search.value && !selectedTag && methodFilter.value === "all";
    document.querySelectorAll("#swagger-ui .opblock").forEach(block => {
      const record = recordFor(block);
      block.hidden = record ? !matches(record) : false;
    });
    document.querySelectorAll("#swagger-ui .opblock-tag-section").forEach(section => {
      const blocks = [...section.querySelectorAll(".opblock")];
      const tag = section.querySelector(".opblock-tag")?.getAttribute("data-tag");
      section.hidden = tag ? !operations.some(op => op.tags.includes(tag) && matches(op)) : blocks.length > 0 && blocks.every(block => block.hidden);
      if (!section.hidden && (search.value || selectedTag || methodFilter.value !== "all")) section.querySelector(".opblock-tag button[aria-expanded='false']")?.click();
    });
    document.querySelectorAll("[data-tag]").forEach(button => {
      const selected = button.dataset.tag === selectedTag;
      button.classList.toggle("selected",selected); button.setAttribute("aria-pressed",String(selected));
    });
    $("#all-endpoints").classList.toggle("selected",!selectedTag);
    $("#all-endpoints").setAttribute("aria-pressed",String(!selectedTag));
  }
  function resetFilters() {search.value = ""; selectedTag = ""; methodFilter.value = "all"; applyFilters();}
  search.addEventListener("input",applyFilters);
  methodFilter.addEventListener("change",applyFilters);
  $("#clear-filters").addEventListener("click",() => {resetFilters(); search.focus();});
  $("#reset-search").addEventListener("click",() => {resetFilters(); search.focus();});
  $("#all-endpoints").addEventListener("click",() => {selectedTag = ""; applyFilters(); scrollTo($("#api-reference"));});

  document.querySelectorAll(".endpoint-link").forEach(button => button.addEventListener("click",() => {
    resetFilters();
    const block = [...document.querySelectorAll("#swagger-ui .opblock")].find(block => {
      const op = recordFor(block); return op?.path === button.dataset.path && op?.method === button.dataset.method;
    });
    if (!block) {announce("The reference is still loading. Retry loading it below."); scrollTo($("#api-reference")); return;}
    const control = block.querySelector(".opblock-summary-control");
    if (!block.classList.contains("is-open")) control?.click();
    scrollTo(block); control?.focus({preventScroll:true});
  }));

  async function loadReference() {
    if (loading) return;
    loading = true;
    $("#schema-error").hidden = true; $("#reference-loading").hidden = false; $("#no-results").hidden = true;
    $("#result-count").textContent = "Loading endpoints…";
    try {
      const response = await fetch(config.schemaUrl,{cache:"no-store",signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error("Schema unavailable");
      const schema = await response.json();
      if (!schema.paths || !schema.info || typeof SwaggerUIBundle !== "function") throw new Error("Invalid schema or missing assets");
      operations = Object.entries(schema.paths).flatMap(([path,item]) => Object.entries(item).filter(([method]) => ["get","post","put","patch","delete","head","options"].includes(method)).map(([method,op]) => ({path,method,tags:op.tags || ["default"],text:[path,method,op.summary,op.description,...(op.tags || [])].join(" ").toLowerCase()})));
      $("#version").textContent = `v${schema.info.version}`;
      $("#nav-count").textContent = String(operations.length);
      $("#tag-navigation").replaceChildren();
      const tags = [...new Set([...(schema.tags || []).map(tag => tag.name),...operations.flatMap(op => op.tags)])].filter(tag => operations.some(op => op.tags.includes(tag)));
      tags.forEach(tag => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "nav-item tag-item"; button.dataset.tag = tag;
        const label = document.createElement("span"), count = document.createElement("span");
        label.textContent = labels[tag] || tag; count.textContent = String(operations.filter(op => op.tags.includes(tag)).length); count.className = "tag-count";
        button.append(label,count);
        button.addEventListener("click",() => {selectedTag = tag; applyFilters(); scrollTo($("#api-reference"));});
        $("#tag-navigation").append(button);
      });
      observer?.disconnect();
      SwaggerUIBundle({
        spec:schema, dom_id:"#swagger-ui", deepLinking:true, docExpansion:"list", filter:false,
        tagsSorter:(a,b) => tags.indexOf(a)-tags.indexOf(b),
        displayRequestDuration:config.displayRequestDuration, persistAuthorization:config.persistAuthorization,
        validatorUrl:config.validatorUrl, tryItOutEnabled:false, defaultModelsExpandDepth:-1,
        presets:[SwaggerUIBundle.presets.apis], layout:"BaseLayout",
        onComplete:() => {$("#reference-loading").hidden = true; applyFilters();},
      });
      let scheduled = false;
      observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true; requestAnimationFrame(() => {scheduled = false; applyFilters(); improveAuthDialog();});
      });
      observer.observe($("#swagger-ui"),{childList:true,subtree:true});
    } catch {
      $("#schema-error").hidden = false; $("#reference-loading").hidden = true;
      $("#result-count").textContent = "Reference unavailable";
    } finally {loading = false; if (!$("#schema-error").hidden) return; applyFilters();}
  }
  $("#retry-schema").addEventListener("click",loadReference);
  void loadReference();
})();
