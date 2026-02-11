/*
  Poro Hunt Website — v5 scripts
  Includes:
  - Animated header on scroll
  - Mobile nav toggle
  - Demo: typing indicator before spawn
  - Demo: micro-animations (pop/shake/flash)
*/

/* Floating Back-to-Top button logic */
const backToTopBtn = document.getElementById("backToTop");

function syncBackToTop() {
  if (!backToTopBtn) return;
  const shouldShow = window.scrollY > 300;
  backToTopBtn.classList.toggle("is-visible", shouldShow);
}

if (backToTopBtn) {
  backToTopBtn.addEventListener("click", () => {
    // Smooth scroll like modern apps
    window.scrollTo({ top: 0, behavior: "smooth" });
    addTempClass(backToTopBtn, "btn-pop", 200); // reuse your micro-animation helper
  });

  window.addEventListener("scroll", syncBackToTop, { passive: true });
  syncBackToTop();
}

function addTempClass(el, className, ms = 250) {
  if (!el) return;
  el.classList.remove(className); // reset if already present
  // Force reflow so the animation can retrigger
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), ms);
}

/* [J1] Header scroll animation */
const siteHeader = document.getElementById("siteHeader");
function onScrollHeader() {
  if (!siteHeader) return;
  const scrolled = window.scrollY > 8;
  siteHeader.classList.toggle("is-scrolled", scrolled);
}
window.addEventListener("scroll", onScrollHeader, { passive: true });
onScrollHeader();

/* [J2] Mobile nav toggle */
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");
if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    addTempClass(navToggle, "btn-pop", 200);
  });
}

/* [J3] Footer year (all pages) */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* [J4] Demo only runs on pages that have #demoRoot */
const demoRoot = document.getElementById("demoRoot");
if (demoRoot) {
  const spawnBtn = document.getElementById("spawnBtn");
  const berryBtn = document.getElementById("berryBtn");
  const catchBtn = document.getElementById("catchBtn");
  const resetDemoBtn = document.getElementById("resetDemoBtn");

  const despawnInput = document.getElementById("despawnInput");
  const channelFeed = document.getElementById("channelFeed");
  const privateBox = document.getElementById("privateBox");

  const oddsValue = document.getElementById("oddsValue");
  const caughtCountEl = document.getElementById("caughtCount");
  const missedCountEl = document.getElementById("missedCount");
  const berriesUsedEl = document.getElementById("berriesUsed");

  const autoSpawnToggle = document.getElementById("autoSpawnToggle");
  const autoSpawnInterval = document.getElementById("autoSpawnInterval");

  const state = {
    activeSpawn: null, // { id, name, baseChance, berryUsed, expiresAt, tickTimer }
    caught: 0,
    missed: 0,
    berriesUsed: 0,
    autoTimer: null,
    typingId: null,   // spawn typing message id
    typingTimeout: null,
  };

  function clampNumber(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function nowMs() { return Date.now(); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function timeStamp() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function setButtonsEnabled(enabled) {
    berryBtn.disabled = !enabled;
    catchBtn.disabled = !enabled;
  }
  function renderCounts() {
    caughtCountEl.textContent = String(state.caught);
    missedCountEl.textContent = String(state.missed);
    berriesUsedEl.textContent = String(state.berriesUsed);
  }

  function getCatchChance() {
    if (!state.activeSpawn) return null;
    const base = state.activeSpawn.baseChance;
    const berryBoost = state.activeSpawn.berryUsed ? 0.18 : 0;
    return clampNumber(base + berryBoost, 0.05, 0.95);
  }
  function renderOdds() {
    const chance = getCatchChance();
    oddsValue.textContent = chance === null ? "—" : `${Math.round(chance * 100)}%`;
  }

  function createDiscordMessage({ role, name, bodyHtml, metaText, tagText, spawnId, classes = [] }) {
    const row = document.createElement("div");
    row.className = ["dmsg", ...classes].join(" ");
    if (spawnId) row.setAttribute("data-spawn-id", spawnId);

    const avatar = document.createElement("div");
    avatar.className = "avatar " + (role === "bot" ? "bot" : "user");
    avatar.textContent = role === "bot" ? "PH" : "U";

    const right = document.createElement("div");

    const head = document.createElement("div");
    head.className = "dmsg-head";

    const nameEl = document.createElement("span");
    nameEl.className = "name " + (role === "bot" ? "bot" : "user");
    nameEl.textContent = name;
    head.appendChild(nameEl);

    if (tagText) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = tagText;
      head.appendChild(tag);
    }

    const t = document.createElement("span");
    t.className = "time";
    t.textContent = timeStamp();
    head.appendChild(t);

    const body = document.createElement("div");
    body.className = "dmsg-body";
    body.innerHTML = bodyHtml;

    right.appendChild(head);
    right.appendChild(body);

    if (metaText) {
      const meta = document.createElement("div");
      meta.className = "meta-line";
      meta.textContent = metaText;
      right.appendChild(meta);
    }

    row.appendChild(avatar);
    row.appendChild(right);
    return row;
  }

  function prependToChannel(el) {
    channelFeed.prepend(el);
  }

  function setPrivateMessage(title, bodyHtml) {
    privateBox.innerHTML = `
      <div class="ephemeral">
        <div class="dmsg" style="grid-template-columns: 1fr; padding: 10px;">
          <div class="dmsg-head" style="margin-bottom: 4px;">
            <span class="name" style="font-weight: 900;">${title}</span>
            <span class="time">${timeStamp()}</span>
          </div>
          <div class="dmsg-body">${bodyHtml}</div>
        </div>
      </div>
    `;
  }

  function cancelActiveSpawnTick() {
    if (state.activeSpawn?.tickTimer) clearInterval(state.activeSpawn.tickTimer);
  }

  function secondsLeft() {
    if (!state.activeSpawn) return 0;
    return Math.max(0, Math.ceil((state.activeSpawn.expiresAt - nowMs()) / 1000));
  }

  function updateSpawnMeta() {
    if (!state.activeSpawn) return;
    const el = channelFeed.querySelector(`[data-spawn-id="${state.activeSpawn.id}"]`);
    if (!el) return;
    const meta = el.querySelector(".meta-line");
    if (!meta) return;
    meta.textContent = `Despawn in ${secondsLeft()}s`;
  }

  function fadeAndRemoveBySpawnId(spawnId) {
    const el = channelFeed.querySelector(`[data-spawn-id="${spawnId}"]`);
    if (!el) return;
    el.classList.add("fading");
    window.setTimeout(() => el.remove(), 560);
  }

  function clearTyping() {
    if (state.typingTimeout) clearTimeout(state.typingTimeout);
    state.typingTimeout = null;

    if (state.typingId) {
      const typingEl = channelFeed.querySelector(`[data-typing-id="${state.typingId}"]`);
      if (typingEl) typingEl.remove();
    }
    state.typingId = null;
  }

  // A) Typing indicator before spawn message
  function showTypingThenSpawn(spawnFn) {
    clearTyping();

    const typingId = String(Math.random()).slice(2);
    state.typingId = typingId;

    const typingRow = document.createElement("div");
    typingRow.className = "dmsg spawn-in";
    typingRow.setAttribute("data-typing-id", typingId);

    typingRow.innerHTML = `
      <div class="avatar bot">PH</div>
      <div>
        <div class="dmsg-head">
          <span class="name bot">Poro Hunt</span>
          <span class="tag">APP</span>
          <span class="time">${timeStamp()}</span>
        </div>
        <div class="dmsg-body">
          <span class="typing">
            <span class="muted">typing</span>
            <span class="dots" aria-hidden="true">
              <span class="dotty"></span>
              <span class="dotty"></span>
              <span class="dotty"></span>
            </span>
          </span>
        </div>
      </div>
    `;
    prependToChannel(typingRow);

    // Delay feels like a real bot posting (tweak to taste)
    const delay = 650 + Math.floor(Math.random() * 350);
    state.typingTimeout = setTimeout(() => {
      clearTyping();
      spawnFn();
    }, delay);
  }

  function despawnActive(reasonText = "Nobody caught it in time. The poro vanished.") {
    if (!state.activeSpawn) return;

    const oldId = state.activeSpawn.id;
    cancelActiveSpawnTick();

    const msgEl = channelFeed.querySelector(`[data-spawn-id="${oldId}"]`);
    if (msgEl) msgEl.classList.remove("spawn-live");

    fadeAndRemoveBySpawnId(oldId);

    const follow = createDiscordMessage({
      role: "bot",
      name: "Poro Hunt",
      tagText: "APP",
      bodyHtml: `<span class="muted">${reasonText}</span>`,
      classes: ["spawn-in"],
    });
    prependToChannel(follow);

    state.activeSpawn = null;
    setButtonsEnabled(false);
    renderOdds();
  }

  function startSpawnTick() {
    if (!state.activeSpawn) return;
    const spawnId = state.activeSpawn.id;

    state.activeSpawn.tickTimer = setInterval(() => {
      if (!state.activeSpawn || state.activeSpawn.id !== spawnId) {
        clearInterval(state.activeSpawn?.tickTimer);
        return;
      }
      if (nowMs() >= state.activeSpawn.expiresAt) {
        despawnActive();
        return;
      }
      updateSpawnMeta();
      renderOdds();
    }, 250);
  }

  function randomPoroName() {
    const names = ["Fluft", "Mochi", "Nimbus", "Pebble", "Sprout", "Waffles", "Bloop"];
    return names[Math.floor(Math.random() * names.length)];
  }

  function spawnPoroImmediate({ quiet = false } = {}) {
    if (state.activeSpawn) {
      despawnActive("A new poro is taking over the spawn slot.");
    }

    const seconds = clampNumber(Number(despawnInput.value || 15), 5, 120);

    const poro = {
      id: String(Math.random()).slice(2),
      name: randomPoroName(),
      baseChance: 0.35,
      berryUsed: false,
      expiresAt: nowMs() + seconds * 1000,
      tickTimer: null,
    };

    state.activeSpawn = poro;
    setButtonsEnabled(true);
    renderOdds();

    const spawnMsg = createDiscordMessage({
      role: "bot",
      name: "Poro Hunt",
      tagText: "APP",
      bodyHtml: `<strong>A wild poro appears!</strong> <span class="muted">(${poro.name})</span><br/>
                Click <strong>Catch</strong> to attempt — or toss a <strong>Berry</strong> first.`,
      metaText: `Despawn in ${secondsLeft()}s`,
      spawnId: poro.id,
      classes: ["spawn-in", "spawn-live"],
    });

    prependToChannel(spawnMsg);

    if (!quiet) {
      setPrivateMessage("Spawn created", `A poro spawned in <strong>#spawn-channel</strong>. Try tossing a berry, then catching.`);
    }

    startSpawnTick();
  }

  function spawnPoro({ quiet = false } = {}) {
    // A) typing indicator before spawn
    showTypingThenSpawn(() => spawnPoroImmediate({ quiet }));
  }

  function tossBerry() {
    if (!state.activeSpawn) return;

    addTempClass(berryBtn, "btn-shake", 280); // B) micro-anim
    if (state.activeSpawn.berryUsed) {
      setPrivateMessage("Berry already used", "You already tossed a berry for this spawn.");
      return;
    }

    state.activeSpawn.berryUsed = true;
    state.berriesUsed += 1;
    renderCounts();
    renderOdds();

    const actionMsg = createDiscordMessage({
      role: "user",
      name: "You",
      bodyHtml: `tossed a berry 🍓 <span class="muted">(boosted odds for this spawn)</span>`,
      classes: ["spawn-in"],
    });
    prependToChannel(actionMsg);

    setPrivateMessage("Berry tossed", "Boost applied. Your next catch attempt is more likely to succeed.");
  }

  function attemptCatch() {
    if (!state.activeSpawn) return;

    addTempClass(catchBtn, "btn-flash", 340); // B) micro-anim
    if (nowMs() >= state.activeSpawn.expiresAt) {
      despawnActive("Too late — it already despawned.");
      setPrivateMessage("Too late", "That poro already despawned.");
      return;
    }

    const chance = getCatchChance();
    if (chance === null) return;

    const attemptMsg = createDiscordMessage({
      role: "user",
      name: "You",
      bodyHtml: `attempted to <strong>catch</strong> the poro…`,
      classes: ["spawn-in"],
    });
    prependToChannel(attemptMsg);

    const roll = Math.random();
    const success = roll < chance;

    if (success) {
      state.caught += 1;
      renderCounts();

      setPrivateMessage(
        "Success 🎉",
        `You caught <strong>${state.activeSpawn.name}</strong>!<br/>
         <span class="muted">Roll: ${roll.toFixed(2)} vs Chance: ${chance.toFixed(2)}</span>`
      );

      const oldId = state.activeSpawn.id;
      cancelActiveSpawnTick();

      const msgEl = channelFeed.querySelector(`[data-spawn-id="${oldId}"]`);
      if (msgEl) msgEl.classList.remove("spawn-live");
      fadeAndRemoveBySpawnId(oldId);

      const botMsg = createDiscordMessage({
        role: "bot",
        name: "Poro Hunt",
        tagText: "APP",
        bodyHtml: `Someone caught the poro! <span class="muted">(result can be private in the real bot)</span>`,
        classes: ["spawn-in"],
      });
      prependToChannel(botMsg);

      state.activeSpawn = null;
      setButtonsEnabled(false);
      renderOdds();
    } else {
      state.missed += 1;
      renderCounts();

      setPrivateMessage(
        "Miss",
        `You failed to catch <strong>${state.activeSpawn.name}</strong>.<br/>
         <span class="muted">Roll: ${roll.toFixed(2)} vs Chance: ${chance.toFixed(2)}</span>`
      );

      updateSpawnMeta();
    }
  }

  /* Auto spawn */
  function stopAutoSpawn() {
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }

  function startAutoSpawn() {
    stopAutoSpawn();
    const sec = clampNumber(Number(autoSpawnInterval.value || 25), 8, 120);

    // Spawn immediately, then on interval
    spawnPoro({ quiet: true });
    state.autoTimer = setInterval(() => spawnPoro({ quiet: true }), sec * 1000);

    setPrivateMessage("Auto spawn enabled", `A poro will auto-spawn about every <strong>${sec}s</strong>.`);
  }

  function syncAutoSpawn() {
    if (autoSpawnToggle.checked) startAutoSpawn();
    else {
      stopAutoSpawn();
      setPrivateMessage("Auto spawn disabled", "Auto spawns have been turned off.");
    }
  }

  function resetDemo() {
    stopAutoSpawn();
    cancelActiveSpawnTick();
    clearTyping();

    state.activeSpawn = null;
    state.caught = 0;
    state.missed = 0;
    state.berriesUsed = 0;

    channelFeed.innerHTML = "";
    setButtonsEnabled(false);
    renderCounts();
    renderOdds();

    privateBox.innerHTML = `
      <div class="ephemeral">
        <p class="muted">No results yet. Spawn a poro and try catching it.</p>
      </div>
    `;

    autoSpawnToggle.checked = false;
  }

  /* Wire events */
  spawnBtn.addEventListener("click", () => {
    addTempClass(spawnBtn, "btn-pop", 200); // B) micro-anim
    spawnPoro();
  });
  berryBtn.addEventListener("click", tossBerry);
  catchBtn.addEventListener("click", attemptCatch);
  resetDemoBtn.addEventListener("click", resetDemo);

  autoSpawnToggle.addEventListener("change", syncAutoSpawn);
  autoSpawnInterval.addEventListener("change", () => {
    if (autoSpawnToggle.checked) startAutoSpawn();
  });

  /* Init */
  resetDemo();
}