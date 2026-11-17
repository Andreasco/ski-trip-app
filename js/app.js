(() => {
  const { TRIP, store, tripCost, houseTotal, paintPanorama, paintGrain, paintEdge, paintArm, paintSpeckle, paintScene } = globalThis;
  const $ = (selector) => document.querySelector(selector);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Italian skips the thousands dot on four digits unless asked.
  const grouped = (value) => value.toLocaleString("it-IT", { useGrouping: "always" });
  const euro = (value) => `${grouped(Math.round(value))} €`;
  // A line may break after the slash, never before it.
  const keepSlash = (name) => name.replace(" / ", "\u00a0/ ");
  const peopleCount = (count) => `${count} ${count === 1 ? "persona" : "persone"}`;
  const nightsWord = (n) => `${n} ${n === 1 ? "notte" : "notti"}`;
  const byId = (id) => TRIP.destinations.find((d) => d.id === id);
  const disc = (grade) => `<svg class="disc disc-${grade}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>`;
  const COUNT = { 1: "una", 2: "due", 3: "tre", 4: "quattro", 5: "cinque", 6: "sei" };
  const origin = (label, source) => source
    ? `<a class="tag" href="${source.url}" target="_blank" rel="noopener">${label}: ${source.label}</a>`
    : `<span class="tag">${label}</span>`;

  // Lodgings come from the group: only a real https address ever becomes a link.
  const safeUrl = (text) => {
    try {
      const url = new URL(text);
      return url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  };
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  // Shared rows can name destinations that changed since: keep only those that exist, once each.
  const validRanking = (ranking) => (Array.isArray(ranking) ? [...new Set(ranking)].filter((id) => TRIP.destinations.some((d) => d.id === id)) : []);
  // The button stays busy until the answer arrives, so a second tap cannot save twice.
  const attempt = async (status, success, action, button, { busy = "Salvo…", failed = "salvare", known = {} } = {}) => {
    if (button.disabled) return null;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busy;
    try {
      const result = await action();
      status.textContent = success;
      return result ?? true;
    } catch (error) {
      status.textContent = known[error.message] || (error.refused
        ? `${failed === "salvare" ? "Il salvataggio è stato rifiutato" : "La richiesta è stata rifiutata"}: controlla i valori e riprova. Se succede ancora, avvisa chi organizza.`
        : `Non sono riuscito a ${failed}. Controlla la rete; se la rete c'è, avvisa chi organizza.`);
      return null;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  // Everything about the group comes from the database, after the gate.
  const me = () => store.listPeople().find((p) => p.id === store.session?.person) || store.session;
  const nameOf = (id) => store.listPeople().find((p) => p.id === id)?.name || id;

  // The starred lodging sets the published figures; without a star, the cheapest per night.
  const houseOf = (dest) => {
    const listed = store.listHouses().filter((h) => h.dest === dest.id);
    return listed.find((h) => h.official) || [...listed].sort((a, b) => a.total / a.nights - b.total / b.nights)[0] || null;
  };
  const stayCost = (dest, nights) => {
    const house = houseOf(dest);
    return house ? houseTotal(house, nights) : 0;
  };

  // Each section registers here, so fresh data redraws them all.
  const renderers = [];
  const renderShared = () => renderers.forEach((render) => render());
  const refreshShared = async () => {
    const online = await store.refresh();
    if (!store.session) {
      history.replaceState(null, "", `${location.pathname}#codice-cambiato`);
      location.reload();
      return;
    }
    $("#votes-note").textContent = online ? "Voti e posti li vediamo tutti." : "Non riesco ad aggiornare: stai vedendo gli ultimi voti scaricati.";
    $("#quotes-note").textContent = online ? "Preventivi e alloggi li vediamo tutti." : "Non riesco ad aggiornare: stai vedendo gli ultimi preventivi scaricati.";
    $("#houses-note").textContent = online ? "L'alloggio con la stella fa il conto della sua meta; se non c'è, vale il più economico. I prezzi sono il totale dell'alloggio, non a testa." : "Non riesco ad aggiornare: stai vedendo gli ultimi alloggi e conti scaricati.";
    renderShared();
  };

  const state = {
    dest: TRIP.destinations[0].id,
    days: TRIP.defaults.days,
    shared: { ...TRIP.defaults.shared },
    // Values typed by the viewer for each destination.
    perDest: {},
  };

  const FIELDS = [
    // The limits match the checks in supabase/schema.sql.
    { id: "cars", label: "Auto", group: "Si divide tra tutti", min: 1, max: 50, step: 1, whole: true },
    { id: "km", label: "Km andata e ritorno", group: "Si divide tra tutti", min: 0, max: 100000, step: 10, perDest: true },
    { id: "consumption", label: "Litri per 100 km", group: "Si divide tra tutti", min: 0, max: 100, step: 0.5 },
    { id: "fuelPrice", label: "Carburante, € al litro", group: "Si divide tra tutti", min: 0, max: 100, step: 0.01 },
    { id: "tolls", label: "Pedaggi andata e ritorno, € per auto", group: "Si divide tra tutti", min: 0, max: 100000, step: 1, perDest: true },
    { id: "nights", label: "Notti", group: "Si divide tra tutti", min: 1, max: 30, step: 1, whole: true },
    { id: "flat", label: "Alloggio, € in totale", group: "Si divide tra tutti", min: 0, max: 1000000, step: 10, perDest: true },
    { id: "pass", label: "Skipass, €", group: "A testa", min: 0, max: 100000, step: 1, perDest: true },
    { id: "foodPerDay", label: "Cibo e après-ski, € al giorno", group: "A testa", min: 0, max: 10000, step: 5 },
    { id: "extras", label: "Altre spese, €", group: "A testa", min: 0, max: 100000, step: 5 },
  ];

  const edits = (dest) => (state.perDest[dest.id] ??= {});
  // A lodging tried with "Usa nel conto" stands in here until the viewer resets; it keeps following nights.
  const stayOf = (dest) => store.listHouses().find((h) => h.id === state.perDest[dest.id]?.house && h.dest === dest.id) || houseOf(dest);
  const inputsOf = (dest, days = state.days) => {
    const typed = state.perDest[dest.id] || {};
    return {
      ...state.shared,
      days,
      km: typed.km ?? dest.trip.km,
      tolls: typed.tolls ?? dest.trip.tolls,
      flatTotal: typed.flat ?? (stayOf(dest) ? houseTotal(stayOf(dest), state.shared.nights) : 0),
      pass: typed[`pass${days}`] ?? dest.pass[days],
    };
  };
  const fieldValue = (dest, id) => {
    const inputs = inputsOf(dest);
    return id === "flat" ? Math.round(inputs.flatTotal * 100) / 100 : inputs[id];
  };
  // The published figures: the hero and the objections state these, whatever the viewer is trying out.
  const defaultsOf = (dest, days, people = TRIP.defaults.shared.people) => ({
    ...TRIP.defaults.shared,
    people,
    days,
    nights: days - 1,
    km: dest.trip.km,
    tolls: dest.trip.tolls,
    flatTotal: stayCost(dest, days - 1),
    pass: dest.pass[days],
  });
  const costOf = (dest, days, people) => tripCost(defaultsOf(dest, days, people));

  function renderHero() {
    if (me()?.line) $("#personal").textContent = me().line;
    const { days } = TRIP.defaults;
    const { people } = TRIP.defaults.shared;
    const fav = byId(TRIP.favorite);
    const others = TRIP.destinations.filter((d) => d !== fav);
    $("#hero-cost").textContent = houseOf(fav) ? `${fav.name} costa circa ${euro(costOf(fav, days).total)} a testa, in ${COUNT[people]}, con alloggio, skipass e viaggio dentro.` : "";
    $("#signs").innerHTML = `<a class="sign sign-main" href="#mete">${disc(fav.grade)}<span class="sign-name">${keepSlash(fav.name)}<small>La proposta</small></span><span class="sign-data">${fav.drive}<br>${houseOf(fav) ? `stima ${euro(costOf(fav, days).total)}` : "casa da scegliere"}</span></a>
      <a class="sign sign-more" href="#alternative"><span class="sign-discs">${others.map((d) => disc(d.grade)).join("")}</span><span class="sign-name">${others.length} alternative</span><span class="sign-data">${others.map((d) => d.name.split(" / ")[0]).join(", ")}</span></a>`;
  }

  function renderCostObjection() {
    const { days } = TRIP.defaults;
    const { people } = TRIP.defaults.shared;
    const priced = TRIP.destinations.filter(houseOf).map((d) => ({ id: d.id, name: d.name, total: costOf(d, days).total }));
    if (!priced.length) {
      $("#cost-objection").textContent = "Appena inseriamo gli alloggi, qui compare il conto di ogni meta.";
      return;
    }
    const missing = TRIP.destinations.filter((d) => !houseOf(d)).map((d) => d.name);
    const listed = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing.at(-1)}` : missing[0];
    const fav = priced.find((p) => p.id === TRIP.favorite);
    const alts = priced.filter((p) => p !== fav).map((p) => p.total);
    const parts = [`Facciamo due conti. In ${COUNT[people]}, con ${COUNT[days - 1]} notti e ${COUNT[days]} giorni di sci, ${fav ? `${fav.name} costa ${euro(fav.total)} a testa: ${euro(fav.total / days)} per ogni giorno sulla neve.` : `${byId(TRIP.favorite).name} aspetta ancora il suo alloggio.`}`];
    if (alts.length) parts.push(alts.length === 1 ? `L'alternativa con un alloggio costa ${euro(alts[0])} a testa.` : `Le alternative vanno da ${euro(Math.min(...alts))} a ${euro(Math.max(...alts))} a testa.`);
    if (missing.length) parts.push(`Manca ancora l'alloggio per ${listed}.`);
    parts.push("Il prezzo degli alloggi si conferma quando prenotiamo; intanto qui sopra puoi cambiare ogni voce, anche giorni e persone.");
    $("#cost-objection").textContent = parts.join(" ");
  }

  const vote = (n) => `${String(n).replace(".", ",")}/10`;
  const CHEVRON = `<svg class="fold-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>`;

  function renderDestinations() {
    const plate = (d) => `<div class="plate"><canvas data-paint="${d.id}" role="img" aria-label="Panorama dipinto di ${d.name}"></canvas></div>`;
    const body = (d) => `
          <p>${d.pitch}</p>
          <div class="pros"><h4>I pro</h4><ul>${d.pros.map((p) => `<li>${p}</li>`).join("")}</ul></div>
          <dl class="facts">
            <div><dt>Piste</dt><dd>${d.km} km</dd></div>
            <div><dt>Quota massima</dt><dd>${grouped(d.top)} m</dd></div>
            <div><dt>Da Torino</dt><dd>${d.drive}</dd></div>
            <div><dt>Voti</dt><dd>Sci ${vote(d.ratings.ski)}<br>Après-ski ${vote(d.ratings.apres)}</dd></div>
          </dl>
          <h4 class="apres-title">Come si fa après-ski</h4>
          <ul class="venues">${d.apres.venues.map((v) => `<li><a href="${v.url}" target="_blank" rel="noopener">${v.name}</a>, ${v.when}. ${v.text}</li>`).join("")}</ul>
          <p>${d.apres.how}</p>
          <p class="note"><strong>Da mettere in conto:</strong> ${d.downside}</p>
          <p class="dest-actions">
            <a class="btn" href="#volo" data-fly="${d.id}">Sorvola ${d.name.split(" / ")[0]}</a>
            <a class="btn btn-quiet" href="#conto" data-budget="${d.id}">Fai il conto</a>
          </p>`;
    const fav = byId(TRIP.favorite);
    $("#dest-list").innerHTML = `
      <article class="dest" id="${fav.id}">
        ${plate(fav)}
        <div class="dest-body">
          <h3>${disc(fav.grade)} ${keepSlash(fav.name)}</h3>
          <p class="lead">${fav.gradeLabel}. ${fav.title}</p>
          <p class="why">${fav.why}</p>${body(fav)}
        </div>
      </article>`;
    // Folded, the plates are not painted until someone opens them.
    $("#alt-list").innerHTML = TRIP.destinations.filter((d) => d !== fav).map((d) => `
      <details class="dest alt" id="${d.id}">
        <summary>${disc(d.grade)}<span class="alt-name"><strong>${keepSlash(d.name)}</strong><span>${d.gradeLabel}. ${d.title}</span><small>${d.drive} da Torino, ${d.km} km di piste</small></span>${CHEVRON}</summary>
        ${plate(d)}
        <div class="dest-body">${body(d)}
        </div>
      </details>`).join("");
  }

  const houseLink = (house) => {
    const url = safeUrl(house?.url);
    return url ? `<br><a class="tag" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Annuncio: ${escapeHtml(url.hostname)}</a>` : "";
  };
  const dividedBy = (people) => `diviso tra ${peopleCount(people)}`;
  const stayNote = (dest, nights, people) => {
    if (state.perDest[dest.id]?.flat !== undefined) return `Importo inserito a mano, ${dividedBy(people)}.`;
    const house = stayOf(dest);
    if (!house) return `Nessun alloggio inserito per questa meta: aggiungine uno in "Gli alloggi trovati".`;
    const scaled = house.nights === nights ? "" : `, riportato a ${nightsWord(nights)}`;
    return `${escapeHtml(house.name)}${house.zone ? `, ${escapeHtml(house.zone)}` : ""}: ${nightsWord(house.nights)} a ${euro(house.total)} in totale${scaled}, ${dividedBy(people)}. Tassa di soggiorno e pulizie: da controllare sull'annuncio.`;
  };

  function renderBudget() {
    const dest = byId(state.dest);
    const inputs = inputsOf(dest);
    const cost = tripCost(inputs);
    const typed = state.perDest[dest.id] || {};
    // The lodging being tried may have been deleted, here or by someone else.
    if (typed.house && !store.listHouses().some((h) => h.id === typed.house)) {
      delete typed.house;
      $("#budget-status").textContent = "";
    }
    const noStay = inputs.flatTotal === 0;
    const passNote = dest.passNotes?.[state.days] ? `<br><small>${dest.passNotes[state.days]}</small>` : "";
    const passSource = typed[`pass${state.days}`] !== undefined
      ? `<span class="tag">Importo inserito a mano</span>`
      : origin(dest.passLabels?.[state.days] || "Listino 2026/27", dest.passSource);
    const tollsTyped = typed.tolls !== undefined && typed.tolls !== dest.trip.tolls;
    const { people, cars } = state.shared;
    $("#ledger-caption").textContent = `${dest.name}, voce per voce: ${peopleCount(people)} e ${cars} auto. Importi arrotondati.`;
    const perCar = (amount) => `${euro(amount)} per auto${cars > 1 ? `, ${cars} auto` : ""}, ${dividedBy(people)}.`;
    $("#ledger-body").innerHTML = `
      <tr><th scope="row">Skipass, ${state.days} giorni${passNote}<br>${passSource}</th><td>${euro(cost.pass)}</td></tr>
      <tr><th scope="row">Alloggio<br><small>${stayNote(dest, inputs.nights, people)}</small>${houseLink(state.perDest[dest.id]?.flat === undefined ? stayOf(dest) : null)}</th><td>${euro(cost.lodging)}</td></tr>
      <tr><th scope="row">Carburante<br><small>${inputs.km} km a ${inputs.consumption} litri per 100 km, ${inputs.fuelPrice.toLocaleString("it-IT")} € al litro di benzina: ${perCar((inputs.km / 100) * inputs.consumption * inputs.fuelPrice)}</small><br>${origin("Prezzo medio", TRIP.sources.fuel)}</th><td>${euro(cost.fuel)}</td></tr>
      <tr><th scope="row">Pedaggi<br><small>${perCar(inputs.tolls)}</small><br>${tollsTyped ? `<span class="tag">Importo inserito a mano</span>` : `<small>${dest.trip.tollsNote}</small><br>${origin("Fonte", dest.trip.tollsSource)}`}</th><td>${euro(cost.tolls)}</td></tr>
      <tr><th scope="row">Cibo e après-ski<br><span class="hand ledger-hand">Spesa più qualche giro al bar: mia stima, non un prezzo</span></th><td>${euro(cost.food)}</td></tr>
      ${cost.extras ? `<tr><th scope="row">Altre spese</th><td>${euro(cost.extras)}</td></tr>` : ""}`;
    $("#ledger-total").textContent = euro(cost.total);
    $("#ledger-total-label").textContent = noStay ? "Totale a testa, senza alloggio" : "Totale a testa";
    $("#live-total").innerHTML = `<span>${dest.name}, ${state.days} giorni</span><strong>${euro(cost.total)}</strong><small>${noStay ? "a testa, senza alloggio" : "a testa"}</small>`;
    $("#ledger-group").textContent = euro(cost.groupTotal);


    FIELDS.forEach(({ id }) => {
      const input = $(`#${id}`);
      if (document.activeElement !== input) input.value = fieldValue(dest, id);
    });

    TRIP.destinations.forEach((d) => {
      // Each destination with the days and people picked in the bill; what is typed there stays in the calculator.
      const row = document.querySelector(`#compare [data-row="${d.id}"]`);
      const house = houseOf(d);
      const total = house ? costOf(d, state.days, people).total : 0;
      row.querySelector(".compare-figure").innerHTML = house ? `<strong>${euro(total)}</strong><small>${d.km} km di piste</small>` : `<strong></strong><small>Casa da scegliere</small>`;
      if (d.id === state.dest) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
      row.querySelector(".compare-stay").textContent = house ? `${house.name}, ${euro(houseTotal(house, state.days - 1))} per ${nightsWord(state.days - 1)}` : "";
    });
    $("#compare-note").textContent = `Cifre di listino con ${state.days} giorni, ${nightsWord(state.days - 1)} e ${peopleCount(people)}; quello che cambi in "Cambia le voci" resta solo nel conto. Tocca una meta per vederne il conto voce per voce.`;
    const fav = byId(TRIP.favorite);
    $("#conto").dataset.dest = dest.id;
    $("#budget-dest").innerHTML = dest === fav
      ? `Il conto della proposta, ${fav.name}. Le altre tre mete sono a confronto nelle <a href="#alternative">alternative</a>.`
      : `Stai guardando ${dest.name}, un'alternativa. <button type="button" class="btn btn-small" data-budget="${fav.id}">Torna ad ${fav.name}</button>`;
    $("#quote-what").textContent = `${dest.name}, ${state.days} giorni, ${euro(cost.total)} a testa${noStay ? ", senza alloggio" : ""}.`;
    renderHouses();
  }

  function setupBudget() {
    $("#compare").innerHTML = TRIP.destinations.map((d) => `
      <li><a class="compare-row" href="#conto" data-row="${d.id}" data-budget="${d.id}">${disc(d.grade)}<span class="compare-name">${keepSlash(d.name)}${d.id === TRIP.favorite ? `<span class="compare-tag">La proposta</span>` : ""}</span><span class="compare-figure"></span><span class="compare-stay"></span></a></li>`).join("");

    const groups = [...new Set(FIELDS.map((f) => f.group))];
    $("#budget-fields").innerHTML = groups.map((group) => `
      <fieldset class="field-group"><legend>${group}</legend><div class="fields">${FIELDS.filter((f) => f.group === group).map((f) => `
        <div class="field">
          <label for="${f.id}">${f.label}</label>
          <input id="${f.id}" type="number" inputmode="${f.whole ? "numeric" : "decimal"}" min="${f.min}" max="${f.max}" step="${f.step}" enterkeyhint="done" autocomplete="off">
          <p id="${f.id}-error" class="error" role="alert" hidden>Serve un numero ${f.whole ? "intero " : ""}da ${grouped(f.min)} a ${grouped(f.max)}. Il conto resta all'ultimo valore valido.</p>
        </div>`).join("")}</div></fieldset>`).join("");

    $("#budget-form").addEventListener("input", (event) => {
      const { name, value, type, id } = event.target;
      if (id === "quote-note") return;
      $("#budget-status").textContent = "";
      if (name === "people") state.shared.people = Number(value);
      if (name === "days") {
        state.days = Number(value);
        // One night fewer than the days skied, unless changed by hand afterwards.
        state.shared.nights = state.days - 1;
      }
      if (type === "number") {
        const field = FIELDS.find((f) => f.id === id);
        const number = Number(value);
        const valid = value !== "" && number >= field.min && number <= field.max && (!field.whole || Number.isInteger(number));
        event.target.setAttribute("aria-invalid", String(!valid));
        if (valid) event.target.removeAttribute("aria-describedby");
        else event.target.setAttribute("aria-describedby", `${id}-error`);
        $(`#${id}-error`).hidden = valid;
        if (!valid) return;
        if (field.perDest) edits(byId(state.dest))[id === "pass" ? `pass${state.days}` : id] = number;
        else state.shared[id] = number;
      }
      renderBudget();
    });
    $("#budget-form").addEventListener("change", (event) => {
      // Empty fields go back to the current value when the viewer leaves them.
      if (event.target.type === "number" && event.target.getAttribute("aria-invalid") === "true") {
        event.target.setAttribute("aria-invalid", "false");
        event.target.removeAttribute("aria-describedby");
        $(`#${event.target.id}-error`).hidden = true;
        event.target.value = fieldValue(byId(state.dest), event.target.id);
      }
    });
    $("#budget-reset").addEventListener("click", () => {
      document.activeElement?.blur();
      state.shared = { ...TRIP.defaults.shared };
      state.perDest = {};
      state.days = TRIP.defaults.days;
      document.querySelector(`input[name="days"][value="${state.days}"]`).checked = true;
      document.querySelector(`input[name="people"][value="${state.shared.people}"]`).checked = true;
      FIELDS.forEach(({ id }) => {
        $(`#${id}`).setAttribute("aria-invalid", "false");
        $(`#${id}`).removeAttribute("aria-describedby");
        $(`#${id}-error`).hidden = true;
      });
      renderBudget();
      showBudgetStatus("Valori iniziali rimessi su tutte le mete.");
    });
    renderBudget();
    setupQuotes();
    setupHouses();
  }

  function selectBudgetDest(id) {
    $("#budget-status").textContent = "";
    state.dest = id;
    renderBudget();
  }

  const shortDate = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

  // Says where a change in the calculator went, past the sticky total.
  const showBudgetStatus = (text) => {
    $("#budget-status").textContent = text;
    $("#budget-edit").open = true;
    $("#budget-status").focus({ preventScroll: true });
    $("#budget-status").scrollIntoView();
  };
  // A saved price that is a listed lodging's stays that lodging.
  const quoteStay = (quote, nights) => store.listHouses().find((h) => h.dest === quote.dest && Math.abs(houseTotal(h, nights) - quote.flatTotal) < 0.005);

  function setupQuotes() {
    const renderQuotes = () => {
      const quotes = store.listQuotes();
      $("#quote-empty").hidden = quotes.length > 0;
      $("#quote-list").innerHTML = quotes.map((quote) => `
        <li>
          <div>
            <strong>${escapeHtml(nameOf(quote.person))}: ${escapeHtml(byId(quote.dest)?.name || quote.dest)}, ${escapeHtml(quote.days)} giorni</strong>
            <small>${quote.nights ? `${escapeHtml(nightsWord(quote.nights))}, ` : ""}${escapeHtml(peopleCount(quote.people))}, ${escapeHtml(quote.cars)} auto${quoteStay(quote, quote.nights ?? quote.days - 1) ? `, con ${escapeHtml(quoteStay(quote, quote.nights ?? quote.days - 1).name)}` : ""}.${Number(quote.flatTotal) === 0 ? " Senza alloggio." : ""} ${quote.note ? `${escapeHtml(quote.note)}, ` : ""}${shortDate(quote.createdAt)}</small>
          </div>
          <span class="quote-total">${euro(tripCost(quote).total)}<small>a testa, tutto il viaggio</small></span>
          <div class="quote-actions">
            <button type="button" class="btn btn-small" data-open="${escapeHtml(quote.id)}" aria-label="Riapri il preventivo di ${escapeHtml(nameOf(quote.person))}: ${escapeHtml(byId(quote.dest)?.name || quote.dest)}">Riapri</button>
            ${quote.person === store.session?.person ? `<button type="button" class="btn btn-small btn-quiet" data-delete="${escapeHtml(quote.id)}" aria-label="Elimina il tuo preventivo: ${escapeHtml(byId(quote.dest)?.name || quote.dest)}">Elimina</button>` : ""}
          </div>
        </li>`).join("");
    };
    renderers.push(renderQuotes);

    $("#quote-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const dest = byId(state.dest);
      const saved = await attempt($("#quote-status"), "Preventivo salvato, lo trovi in fondo alla sezione: ora lo vediamo tutti.", () => store.saveQuote({
        note: $("#quote-note").value.trim(),
        dest: dest.id,
        ...inputsOf(dest),
      }), $("#quote-form button"));
      if (!saved) return;
      $("#quote-note").value = "";
      renderShared();
    });

    $("#quote-list").addEventListener("click", async (event) => {
      const del = event.target.dataset?.delete;
      const open = event.target.dataset?.open;
      if (del) {
        if (!confirm("Eliminare questo preventivo? Non si può annullare.")) return;
        await attempt($("#quote-list-status"), "Preventivo eliminato.", () => store.deleteQuote(del), event.target, { busy: "Elimino…", failed: "eliminare" });
        renderShared();
        $("#quote-list-status").focus();
      }
      if (open) {
        const quote = store.listQuotes().find((q) => q.id === open);
        if (!quote) return;
        // Destinations may change after a quote is saved.
        if (!byId(quote.dest) || !(quote.days in byId(quote.dest).pass)) {
          $("#quote-list-status").textContent = "Questo preventivo non si può riaprire: la meta o i giorni non ci sono più.";
          return;
        }
        const { people, cars, consumption, fuelPrice, foodPerDay, extras, days, dest, km, tolls, flatTotal, pass } = quote;
        const nights = quote.nights ?? days - 1;
        state.shared = { people, cars, nights, consumption, fuelPrice, foodPerDay, extras };
        state.days = days;
        state.dest = dest;
        // Only values that differ from the defaults stay fixed, so changing days still reprices the rest.
        const reopened = byId(dest);
        const typed = { km, tolls };
        const stay = quoteStay(quote, nights);
        if (stay) typed.house = stay.id;
        else if (flatTotal !== stayCost(reopened, nights)) typed.flat = flatTotal;
        if (pass !== reopened.pass[days]) typed[`pass${days}`] = pass;
        state.perDest[dest] = typed;
        document.querySelector(`input[name="days"][value="${days}"]`).checked = true;
        const together = document.querySelector(`input[name="people"][value="${people}"]`);
        if (together) together.checked = true;
        renderBudget();
        showBudgetStatus("Preventivo riaperto: puoi modificarlo in Cambia le voci.");
      }
    });
  }

  // Anyone adds what they find; the organizer stars the one that sets the published figures.
  function renderHouses() {
    const { organizer, person: self } = store.session || {};
    const { days } = state;
    const { people } = state.shared;
    const houses = store.listHouses();
    const actions = (h, usable) => {
      const name = escapeHtml(h.name);
      return `<div class="quote-actions">
            ${usable ? `<button type="button" class="btn btn-small" data-use="${escapeHtml(h.id)}" aria-label="Usa nel conto: ${name}">Usa nel conto</button>` : ""}
            ${organizer && usable ? `<button type="button" class="btn btn-small btn-quiet" data-star="${escapeHtml(h.id)}" aria-label="${h.official ? "Togli il riferimento a" : "Segna come riferimento"}: ${name}">${h.official ? "Togli riferimento" : "Segna come riferimento"}</button>` : ""}
            ${organizer || h.person === self ? `<button type="button" class="btn btn-small btn-quiet" data-drop="${escapeHtml(h.id)}" aria-label="Elimina: ${name}">Elimina</button>` : ""}
          </div>`;
    };
    const about = (h) => `<small>${h.zone ? `${escapeHtml(h.zone)}. ` : ""}Trovato da ${escapeHtml(nameOf(h.person))}, ${shortDate(h.createdAt)}.</small>
            ${h.note ? `<small>${escapeHtml(h.note)}</small>` : ""}`;
    const d = byId(state.dest);
    const listed = houses.filter((h) => h.dest === d.id);
    const groups = !listed.length ? [] : [`
      <h4>${disc(d.grade)} ${d.name}</h4>
      <ul class="quote-list house-list">${listed.map((h) => {
  const trip = tripCost({ ...defaultsOf(d, days, people), flatTotal: houseTotal(h, days - 1) }).total;
  return `
        <li>
          <div>
            <strong>${escapeHtml(h.name)}</strong>
            ${about(h)}
            <small class="house-trip">Con questo alloggio, tutto il viaggio costa ${euro(trip)} a testa${h.nights === days - 1 ? "" : `, riportato a ${nightsWord(days - 1)}`}.</small>
            ${h.official ? `<span class="house-official"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>Alloggio di riferimento</span>` : ""}
            ${houseLink(h)}
          </div>
          <span class="quote-total">${euro(h.total)}<small>in totale, ${nightsWord(h.nights)}</small></span>
          ${actions(h, true)}
        </li>`;
}).join("")}</ul>`];
    // Lodgings of a destination no longer in the trip stay visible, and can only be removed.
    const orphans = houses.filter((h) => !byId(h.dest));
    if (orphans.length) {
      groups.push(`
      <h4>Altre mete, non più in gara</h4>
      <ul class="quote-list house-list">${orphans.map((h) => `
        <li>
          <div>
            <strong>${escapeHtml(h.name)}</strong>
            ${about(h)}
          </div>
          <span class="quote-total">${euro(h.total)}<small>in totale, ${nightsWord(h.nights)}</small></span>
          ${actions(h, false)}
        </li>`).join("")}</ul>`);
    }
    $("#house-empty").hidden = listed.length > 0;
    $("#house-empty").textContent = `Ancora nessuno ${d.at}: aggiungi il primo qui sotto.`;
    $("#house-list").innerHTML = groups.join("");
  }

  function setupHouses() {
    const select = $("#house-dest");
    select.innerHTML = TRIP.destinations.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");

    $("#house-add").addEventListener("toggle", () => {
      if ($("#house-add").open && !$("#house-name").value) select.value = state.dest;
    });

    $("#house-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await attempt($("#house-status"), "Alloggio salvato: ora lo vediamo tutti.", () => store.saveHouse({
        dest: select.value,
        name: $("#house-name").value,
        zone: $("#house-zone").value,
        url: $("#house-url").value,
        nights: Number($("#house-nights").value),
        total: Number($("#house-total").value),
        note: $("#house-note").value,
      }), $("#house-form button"));
      if (!saved) return;
      ["#house-name", "#house-zone", "#house-url", "#house-total", "#house-note"].forEach((id) => { $(id).value = ""; });
      $("#house-add").open = false;
      // The list shows one destination: go to the one just added to.
      state.dest = select.value;
      renderShared();
      $("#house-status").focus();
    });

    $("#house-list").addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const { use, star, drop } = button.dataset;
      if (drop || star) {
        const house = store.listHouses().find((h) => h.id === drop);
        if (drop && !confirm(`Eliminare ${house?.name || "questo alloggio"}?${house?.official ? " È l'alloggio di riferimento: cambiano i numeri di tutti." : ""} Non si può annullare.`)) return;
        const done = drop ? "Alloggio eliminato." : "Alloggio di riferimento aggiornato.";
        const ok = await attempt($("#house-status"), done, () => (drop ? store.deleteHouse(drop) : store.setOfficialHouse(star)), button, drop ? { busy: "Elimino…", failed: "eliminare" } : { busy: "Aggiorno…", failed: "aggiornare" });
        renderShared();
        // A star keeps the organizer on the row just pressed; a deleted row is gone, so go to the message.
        const pressed = star && ok && document.querySelector(`[data-star="${star}"]`);
        if (pressed) pressed.focus({ preventScroll: true });
        else $("#house-status").focus();
      }
      if (use) {
        const house = store.listHouses().find((h) => h.id === use);
        if (!house) return;
        state.dest = house.dest;
        state.shared.nights = house.nights;
        if (house.nights + 1 in byId(house.dest).pass) state.days = house.nights + 1;
        delete edits(byId(house.dest)).flat;
        edits(byId(house.dest)).house = house.id;
        document.querySelector(`input[name="days"][value="${state.days}"]`).checked = true;
        renderBudget();
        showBudgetStatus(`${house.name} è nel conto: puoi modificarlo in Cambia le voci. Le cifre delle mete non cambiano.`);
      }
    });
  }

  function setupVote() {
    const fav = byId(TRIP.favorite);
    const choiceOf = (vote) => validRanking(vote?.ranking)[0];
    // A saved alternative fills the choice only until the voter picks another.
    let touched = false;
    $("#vote-question").innerHTML = `Ci stai per <strong>${fav.name}</strong>?`;
    $("#save-vote").textContent = `Ci sto per ${fav.name}`;
    $("#other-choices").insertAdjacentHTML("beforeend", TRIP.destinations.filter((d) => d !== fav).map((d) => `
      <label class="choice">${disc(d.grade)}<input type="radio" name="other" value="${d.id}">${keepSlash(d.name)}</label>`).join(""));

    // Seen from above with the windscreen at the top, driving on the left.
    const SEATS = ["Guida", "Passeggero", "Dietro sinistra", "Dietro destra"];
    const NO_YES = "Per salire in auto, prima dimmi che ci stai: il voto è qui sotto.";

    const renderSeats = () => {
      const votes = store.listVotes();
      const voting = votes.filter((vote) => vote.attending);
      $("#vote-results").hidden = votes.length === 0;
      // One vote each, for the proposal or an alternative; the proposal always shows, even at zero.
      $("#vote-tally").innerHTML = TRIP.destinations
        .map((d) => ({ d, count: voting.filter((v) => choiceOf(v) === d.id).length }))
        .filter(({ d, count }) => count || d === fav)
        .sort((a, b) => b.count - a.count || (b.d === fav) - (a.d === fav))
        .map(({ d, count }) => `<li>${disc(d.grade)}<span>${d.name}${d === fav ? `<small>La proposta</small>` : ""}</span><strong>${count} ${count === 1 ? "voto" : "voti"}</strong></li>`).join("");
      $("#vote-people").innerHTML = votes.map((vote) => {
        const name = escapeHtml(nameOf(vote.person));
        const id = choiceOf(vote);
        const choice = !vote.attending ? "stavolta passa" : id === fav.id ? `ci sta per ${fav.name}` : id ? `preferirebbe ${byId(id).name}` : "ci sta";
        return `<li><strong>${name}</strong>: ${choice}</li>`;
      }).join("");
      const people = store.listPeople();
      const seats = store.listSeats();
      const self = store.session?.person;
      // The organizer is aboard from the start; the others until they say otherwise are still to confirm.
      const statusOf = (person) => {
        const vote = votes.find((row) => row.person === person?.id);
        return vote ? (vote.attending ? "A bordo" : "Stavolta passa") : person?.organizer ? "A bordo" : "Da confermare";
      };
      // The car is made of who said yes; the organizer is aboard unless passing.
      const myVote = votes.find((row) => row.person === self);
      const canSit = myVote ? myVote.attending : !!store.session?.organizer;
      $("#seats").innerHTML = SEATS.map((where, index) => {
        const taken = seats.find((row) => row.seat === index + 1);
        const data = `data-seat="${index + 1}"`;
        if (!taken) {
          const inside = `<small>${where}</small><strong>Libero</strong>`;
          return `<li>${!canSit ? `<div class="seat is-free">${inside}</div>` : `<button type="button" class="seat is-free" ${data} aria-label="Sali qui: ${where}">${inside}</button>`}</li>`;
        }
        const person = people.find((p) => p.id === taken.person);
        const status = statusOf(person);
        const look = `seat${status === "A bordo" ? " is-in" : ""}`;
        const name = escapeHtml(person?.name || taken.person);
        if (taken.person !== self) return `<li><div class="${look}"><small>${where}</small><strong>${name}</strong><small>${status}</small></div></li>`;
        return `<li><button type="button" class="${look} is-mine" ${data} aria-label="Scendi da questo posto: ${where}"><small>${where}</small><strong>${name} (tu)</strong><small>${status}</small></button></li>`;
      }).join("");
      const standing = people.filter((p) => !seats.some((row) => row.person === p.id));
      const names = (list) => list.map((p) => escapeHtml(p.name || p.id)).join(", ");
      const ground = standing.filter((p) => statusOf(p) !== "Stavolta passa");
      const away = standing.filter((p) => statusOf(p) === "Stavolta passa");
      // Friends see the car as it is; who is still on the ground or passing is for the organizer.
      $("#seat-ground").innerHTML = !store.session?.organizer ? "" : [ground.length && `Ancora a terra: ${ground.length === 1 ? "una persona" : `${ground.length} persone`}.`, away.length && `Stavolta passa: ${names(away)}.`].filter(Boolean).join(" ");
      $("#seat-hint").textContent = !canSit ? NO_YES : seats.some((row) => row.person === self) ? "Tocca un posto libero per cambiare, o il tuo per scendere." : "Tocca un posto libero per salire.";
    };

    const renderMine = () => {
      const voter = store.session?.person;
      $("#voter-name").textContent = voter ? nameOf(voter) : "";
      const mine = store.listVotes().find((vote) => vote.person === voter);
      const id = mine?.attending ? choiceOf(mine) : null;
      $("#my-vote").hidden = !mine;
      $("#my-vote-text").textContent = !mine ? "" : !mine.attending ? "Il tuo voto: stavolta passi."
        : id === fav.id ? `Il tuo voto: ci stai per ${fav.name}.` : id ? `Il tuo voto: preferiresti ${byId(id).name}.` : "Il tuo voto: ci stai.";
      if (touched) return;
      const radio = id && id !== fav.id && document.querySelector(`input[name="other"][value="${id}"]`);
      document.querySelectorAll('input[name="other"]').forEach((input) => { input.checked = input === radio; });
      if (radio) $("#vote-other").open = true;
    };

    const saveVote = async (attending, id, button) => {
      const message = !attending ? "Segnato: stavolta passi, e lo vediamo tutti. Puoi cambiare idea quando vuoi."
        : id === fav.id ? `Voto salvato: ci stai per ${fav.name}, e lo vediamo tutti.` : `Voto salvato: preferiresti ${byId(id).name}, e lo vediamo tutti.`;
      const saved = await attempt($("#vote-status"), message, () => store.saveVote({ ranking: attending ? [id] : [], attending }), button);
      if (!saved) return;
      touched = false;
      renderShared();
    };
    $("#delete-vote").addEventListener("click", async () => {
      const done = await attempt($("#vote-status"), "Voto cancellato: puoi votare di nuovo quando vuoi.", () => store.deleteVote(), $("#delete-vote"), { busy: "Cancello…", failed: "cancellare il voto" });
      if (!done) return;
      touched = false;
      renderShared();
      // The button is gone with the vote: the next thing to do is vote again.
      $("#save-vote").focus();
    });
    $("#other-choices").addEventListener("input", () => {
      touched = true;
      $("#vote-status").textContent = "";
    });
    $("#save-other").addEventListener("click", () => {
      const picked = document.querySelector('input[name="other"]:checked');
      if (!picked) {
        $("#vote-status").textContent = "Scegli prima quale alternativa preferiresti.";
        return;
      }
      saveVote(true, picked.value, $("#save-other"));
    });
    $("#seats").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-seat]");
      if (!button) return;
      const seat = Number(button.dataset.seat);
      const leaving = store.listSeats().some((row) => row.seat === seat && row.person === store.session?.person);
      const ok = await attempt($("#seat-status"), leaving ? "Posto liberato: ora lo vediamo tutti." : "Posto preso: ora lo vediamo tutti.", () => store.chooseSeat(leaving ? null : seat), button, {
        busy: "Un attimo…",
        failed: "salvare il posto",
        known: { seat_taken: "Quel posto è appena stato preso: scegline un altro.", not_attending: NO_YES },
      });
      // A refusal means this page is behind: show who took the seat.
      if (ok) renderShared();
      else await refreshShared();
      const same = document.querySelector(`[data-seat="${seat}"]`);
      if (same) same.focus({ preventScroll: true });
    });
    $("#save-vote").addEventListener("click", () => saveVote(true, fav.id, $("#save-vote")));
    $("#save-pass").addEventListener("click", () => saveVote(false, null, $("#save-pass")));

    const STATUS = { open: "In discussione", accepted: "Accolta", rejected: "Scartata" };
    const renderProposals = () => {
      const { organizer, person: self } = store.session || {};
      $("#proposal-list").innerHTML = store.listProposals().map((p) => `
        <li><strong>${escapeHtml(nameOf(p.person))}</strong><span>${escapeHtml(p.text)}</span><small>${STATUS[p.status] || "In discussione"}, ${shortDate(p.createdAt)}</small>
        ${organizer || p.person === self ? `<div class="proposal-actions">
          ${organizer ? `<button type="button" class="btn btn-small" data-status="accepted" data-id="${escapeHtml(p.id)}" ${p.status === "accepted" ? "disabled" : ""}>Accogli</button>
          <button type="button" class="btn btn-small btn-quiet" data-status="rejected" data-id="${escapeHtml(p.id)}" ${p.status === "rejected" ? "disabled" : ""}>Scarta</button>` : ""}
          ${p.person === self ? `<button type="button" class="btn btn-small btn-quiet" data-remove="${escapeHtml(p.id)}">Elimina</button>` : ""}
        </div>` : ""}</li>`).join("");
    };
    $("#proposal-list").addEventListener("click", async (event) => {
      const { status, id, remove } = event.target.dataset || {};
      if (remove) {
        await attempt($("#proposal-status"), "Proposta eliminata.", () => store.deleteProposal(remove), event.target);
        renderShared();
      }
      if (!status) return;
      await attempt($("#proposal-status"), `Proposta segnata come ${STATUS[status].toLowerCase()}.`, () => store.setProposalStatus(id, status), event.target);
      renderShared();
    });
    $("#proposal-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const field = $("#proposal-text");
      const text = field.value.trim();
      if (!text) {
        $("#proposal-status").textContent = "Scrivi la proposta prima di salvarla.";
        field.focus();
        return;
      }
      const saved = await attempt($("#proposal-status"), "Proposta salvata: ora la vediamo tutti.", () => store.saveProposal(text), $("#save-proposal"));
      if (!saved) return;
      field.value = "";
      renderShared();
    });

    $("#logout").addEventListener("click", () => {
      store.logout();
      location.replace(location.pathname);
    });
    renderers.push(renderSeats, renderMine, renderProposals);
  }

  // The turnstile in front of everything: a stamped skipass opens it.
  function setupGate() {
    const params = new URLSearchParams(location.hash.slice(1));
    const linkCode = params.get("k");
    const withdrawn = location.hash === "#codice-cambiato";
    if (linkCode || withdrawn) {
      // The code leaves the address bar at once, so it is not there to be copied or shared again.
      history.replaceState(null, "", location.pathname + location.search);
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, reduced ? 0 : ms));
    const gate = $("#gate");
    const form = $("#gate-form");
    const field = $("#gate-code");
    const status = $("#gate-status");
    const button = $("#gate-submit");
    // A personal link tapped while the app is open changes only the hash, so nothing would reload.
    addEventListener("hashchange", () => {
      if (location.hash.startsWith("#k=")) location.reload();
    });

    if (store.session) {
      if (linkCode && linkCode !== store.session.code) store.logout();
      else return refreshShared();
    }
    document.documentElement.classList.add("locked");
    // A personal link greets its owner on the skipass; a broken one surfaces when stamped.
    if (linkCode) {
      store.identify(linkCode).then(({ name, line }) => {
        if (form.classList.contains("is-stamped")) return;
        $("#gate-name").textContent = name || "";
        $("#gate-name").hidden = !name;
        $("#gate-line").textContent = line || "";
        $("#gate-line").hidden = !line;
      }).catch(() => {});
    }
    if (withdrawn) status.textContent = "Il tuo codice è cambiato: chiedi quello nuovo a chi organizza.";
    field.addEventListener("input", () => {
      field.setAttribute("aria-invalid", "false");
      status.textContent = "";
    });
    // A personal link needs only the tap; the field stays for anyone without one.
    $("#gate-field").hidden = Boolean(linkCode);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = $("#gate-field").hidden ? linkCode : field.value.trim();
      if (!code) {
        status.textContent = "Scrivi il codice del tuo skipass.";
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "Controllo lo skipass";
      status.textContent = "";
      try {
        await store.login(code);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Timbra lo skipass";
        if (error.message === "bad_code") {
          $("#gate-field").hidden = false;
          field.setAttribute("aria-invalid", "true");
          status.textContent = "Questo codice non apre il tornello. Controlla il link o chiedilo a chi organizza.";
          field.focus();
        } else {
          status.textContent = "Non riesco a raggiungere gli impianti. Controlla la rete; se la rete c'è, avvisa chi organizza.";
          button.focus();
        }
        return;
      }
      field.setAttribute("aria-invalid", "false");
      $("#gate-name").textContent = store.session.name || store.session.person;
      $("#gate-name").hidden = false;
      $("#gate-line").hidden = true;
      $("#gate-field").hidden = true;
      renderHero();
      refreshShared();
      form.classList.add("is-stamped");
      button.textContent = "Buona discesa";
      // Long enough to enjoy the stamp and the wish before the turnstile opens.
      await sleep(3500);
      gate.classList.add("is-open");
      document.documentElement.classList.remove("locked");
      $("#top h1").focus({ preventScroll: true });
      await sleep(3200);
      gate.classList.remove("is-open");
      if (location.hash.length > 1) document.querySelector(location.hash)?.scrollIntoView();
    });
    return undefined;
  }

  function setupLeave() {
    const chosen = TRIP.chosen && byId(TRIP.chosen);
    $("#route").innerHTML = (chosen ? [chosen] : TRIP.destinations)
      .map((d) => `<li>${disc(d.grade)}<div><strong>${d.name}</strong><span>${d.route}</span></div></li>`).join("");
    $("#route-title").textContent = chosen ? `La strada per ${chosen.name}` : "Le strade, finché non scegliamo";

    const KEY = "ski-checklist-2";
    let ticked = [];
    try {
      ticked = JSON.parse(localStorage.getItem(KEY)) || [];
    } catch { /* storage may be blocked */ }
    const list = $("#checklist");
    list.innerHTML = TRIP.checklist.map((item, i) => `
      <li><label><input type="checkbox" data-index="${i}" ${ticked.includes(i) ? "checked" : ""}>${item}</label></li>`).join("");
    list.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      ticked = event.target.checked ? [...ticked, index] : ticked.filter((i) => i !== index);
      try {
        localStorage.setItem(KEY, JSON.stringify(ticked));
      } catch { /* the ticks last until the page closes */ }
    });

    $("#map-dest").innerHTML = TRIP.destinations.map((d) => `<button type="button" class="pill" data-map="${d.id}">${d.name}</button>`).join("");
    $("#map-dest").addEventListener("click", (event) => {
      const id = event.target.dataset?.map;
      if (id) drawPisteMap(id);
    });
    drawPisteMap((chosen || TRIP.destinations[0]).id);
  }

  const PISTE_COLORS = { novice: "#1f5fbf", easy: "#1f5fbf", intermediate: "#c8202f", advanced: "#10192b", expert: "#10192b", freeride: "#10192b" };

  async function drawPisteMap(id) {
    document.querySelectorAll("[data-map]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.map === id)));
    const canvas = $("#piste-map");
    const status = $("#piste-status");
    status.textContent = "";
    let data;
    try {
      data = await (await fetch(`data/pistes-${id}.geojson`)).json();
    } catch {
      canvas.hidden = true;
      status.textContent = "La mappa non è ancora salvata: apri questa pagina una volta con la rete.";
      return;
    }
    canvas.hidden = false;
    const lines = data.features.map((f) => f.geometry.coordinates);
    const all = lines.flat();
    const [lonMin, lonMax] = [Math.min(...all.map((c) => c[0])), Math.max(...all.map((c) => c[0]))];
    const [latMin, latMax] = [Math.min(...all.map((c) => c[1])), Math.max(...all.map((c) => c[1]))];
    const aspect = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
    const ratio = (lonMax - lonMin) * aspect / (latMax - latMin);
    const width = Math.min(900, canvas.parentElement.clientWidth * 2);
    canvas.width = width;
    canvas.height = Math.round(width / Math.max(0.7, ratio));
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pad = 16;
    const sx = (canvas.width - pad * 2) / (lonMax - lonMin);
    const sy = (canvas.height - pad * 2) / (latMax - latMin);
    data.features.forEach((feature) => {
      const line = feature.geometry.coordinates;
      if (line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1]) return;
      ctx.strokeStyle = PISTE_COLORS[feature.properties.d] || "#8ea9bf";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      feature.geometry.coordinates.forEach(([lon, lat], i) => {
        const x = pad + (lon - lonMin) * sx;
        const y = canvas.height - pad - (lat - latMin) * sy;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    ctx.font = "600 26px Barlow, sans-serif";
    byId(id).labels.forEach(({ name, lat, lon }) => {
      if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return;
      const x = Math.min(canvas.width - ctx.measureText(name).width - 8, pad + (lon - lonMin) * sx);
      const y = canvas.height - pad - (lat - latMin) * sy;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f7f9fb";
      ctx.strokeText(name, x, y);
      ctx.fillStyle = "#10192b";
      ctx.fillText(name, x, y);
    });
    status.textContent = `${data.features.length} tratti di pista di ${byId(id).name} salvati per l'offline.`;
  }

  // 3D flight: loaded only when requested, since it is the heaviest thing on the page.
  const flight = { map: null, run: 0, dest: TRIP.heroDest, failed: false };

  const loadMapLibre = () => new Promise((resolve, reject) => {
    if (globalThis.maplibregl) return resolve();
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/maplibre-gl.css";
    document.head.append(css);
    const script = document.createElement("script");
    script.src = "vendor/maplibre-gl.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });

  async function createMap() {
    const dem = {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 13,
      attribution: "Terreno: Mapzen, AWS Open Data",
    };
    const map = new globalThis.maplibregl.Map({
      container: "map",
      cooperativeGestures: true,
      maxPitch: 80,
      attributionControl: { compact: true, customAttribution: "Piste: © OpenStreetMap" },
      style: {
        version: 8,
        sources: { terrain: dem, relief: dem },
        terrain: { source: "terrain", exaggeration: 1.2 },
        sky: { "sky-color": "#4f82b5", "horizon-color": "#e3edf5", "fog-color": "#dce8f2", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.75 },
        layers: [
          { id: "ground", type: "background", paint: { "background-color": "#eef4f8" } },
          {
            id: "tint",
            type: "color-relief",
            source: "relief",
            paint: {
              "color-relief-color": ["interpolate", ["linear"], ["elevation"], 500, "#3e5a5c", 1500, "#34515a", 1900, "#6f8ba3", 2300, "#dce8f2", 4800, "#ffffff"],
            },
          },
          {
            id: "shade",
            type: "hillshade",
            source: "relief",
            paint: {
              "hillshade-shadow-color": "#2b4c7e",
              "hillshade-highlight-color": "#ffffff",
              "hillshade-accent-color": "#5c7fad",
              "hillshade-exaggeration": 1,
              "hillshade-illumination-direction": 300,
            },
          },
        ],
      },
    });
    map.on("error", (event) => {
      if (/tile|fetch|load/i.test(event.error?.message || "")) {
        flight.failed = true;
        $("#flight-status").textContent = "Il terreno non arriva: controlla la connessione e riprova.";
      }
    });
    await new Promise((resolve) => map.once("load", resolve));
    document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    await Promise.all(TRIP.destinations.map(async (d) => {
      try {
        const data = await (await fetch(`data/pistes-${d.id}.geojson`)).json();
        map.addSource(`pistes-${d.id}`, { type: "geojson", data });
        map.addLayer({
          id: `pistes-${d.id}`,
          type: "line",
          source: `pistes-${d.id}`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3],
            "line-color": ["match", ["get", "d"], ["novice", "easy"], PISTE_COLORS.easy, "intermediate", PISTE_COLORS.intermediate, ["advanced", "expert", "freeride"], PISTE_COLORS.advanced, "#8ea9bf"],
          },
        });
      } catch { /* the terrain still flies without piste lines */ }
    }));
    return map;
  }

  async function fly(id) {
    flight.dest = id;
    const run = ++flight.run;
    const status = $("#flight-status");
    const dest = byId(id);
    document.querySelectorAll("[data-flight]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.flight === id)));
    $("#flight-start").textContent = "Sto caricando il terreno";
    $("#flight-start").disabled = true;
    status.textContent = "";
    // Tiles that failed stay failed on the same map, so a retry starts a new one.
    if (flight.failed && flight.map) {
      flight.map.remove();
      flight.map = null;
    }
    flight.failed = false;
    $("#map").classList.add("is-live");
    try {
      await loadMapLibre();
      flight.map = flight.map || await createMap();
    } catch {
      $("#map").classList.remove("is-live");
      status.textContent = "Il volo non parte su questo dispositivo. I panorami dipinti qui sopra restano disponibili.";
      $("#flight-start").textContent = "Riprova il volo";
      $("#flight-start").disabled = false;
      return;
    }
    if (run !== flight.run) return;
    const map = flight.map;
    $("#flight-start").textContent = "In volo";
    map.resize();
    // High ground drifts up the frame, so the focal point sits below the middle.
    const padding = { top: map.getContainer().clientHeight * 0.22 };
    const [first, ...rest] = dest.flight;
    if (reduced) {
      map.jumpTo({ ...dest.flight[dest.flight.length - 1], padding });
    } else {
      map.jumpTo({ ...first, padding });
      for (const [index, frame] of rest.entries()) {
        await new Promise((resolve) => {
          map.once("moveend", resolve);
          map.easeTo({ ...frame, padding, duration: index ? 9000 : 8000, easing: (t) => t * (2 - t), essential: false });
        });
        if (run !== flight.run) return;
      }
    }
    $("#flight-start").textContent = flight.failed ? "Riprova il volo" : `Sorvola di nuovo ${dest.name}`;
    $("#flight-start").disabled = false;
    if (!flight.failed) status.textContent = "Ora puoi esplorare: due dita per muovere la mappa.";
  }

  function setupFlight() {
    const fav = byId(TRIP.favorite);
    const pill = (d, look = "pill") => `<button type="button" class="${look}" data-flight="${d.id}" aria-pressed="${d.id === flight.dest}">${d.name}</button>`;
    $("#flight-dest").innerHTML = `${pill(fav, "pill pill-main")}<span class="pills-or">Oppure un'alternativa:</span>${TRIP.destinations.filter((d) => d !== fav).map((d) => pill(d)).join("")}`;
    $("#flight-dest").addEventListener("click", (event) => {
      const id = event.target.dataset?.flight;
      if (id) fly(id);
    });
    $("#flight-start").addEventListener("click", () => fly(flight.dest));
  }

  function setupLinks() {
    document.addEventListener("click", (event) => {
      const flyLink = event.target.closest("[data-fly]");
      if (flyLink) fly(flyLink.dataset.fly);
      const budgetLink = event.target.closest("[data-budget]");
      if (!budgetLink) return;
      // The script lands on the bill itself; the address stays as the way in without scripts.
      if (budgetLink.matches("a[href]")) event.preventDefault();
      selectBudgetDest(budgetLink.dataset.budget);
      // Wherever the tap came from, the bill now names what it prices: land there, below the sticky total.
      $("#budget-dest").focus({ preventScroll: true });
      $("#budget-dest").scrollIntoView();
    });
  }

  function setupMaterials() {
    const root = document.documentElement.style;
    root.setProperty("--board", paintGrain(320, 120, "#2b4c7e", ["#1b3257", "#3d659c", "#5c7fad"]));
    root.setProperty("--board-ink", paintGrain(320, 120, "#10192b", ["#1b3257", "#2b3a55", "#050a14"]));
    root.setProperty("--edge", paintEdge(640, 26));
    root.setProperty("--arm", paintArm(176, 32));
    root.setProperty("--speckle", paintSpeckle(160, 80));
    root.setProperty("--wood", paintGrain(24, 300, "#6b4a2f", ["#3f2a19", "#8a6543", "#52381f"], { vertical: true, passes: 120 }));
    root.setProperty("--paper", paintGrain(320, 320, "#f7f9fb", ["#dce8f2", "#c5d6e4", "#ffffff"], { fibre: true, passes: 900 }));
    document.querySelectorAll(".piste-key").forEach((key) => {
      key.innerHTML = `<li>${disc("blue")} Facile</li><li>${disc("red")} Media</li><li>${disc("black")} Difficile</li><li>${disc("none")} Senza grado</li>`;
    });
  }

  function setupPanoramas() {
    const noteSynthetic = (canvas, { synthetic }) => {
      if (synthetic) canvas.parentElement.insertAdjacentHTML("beforeend", `<p class="plate-note">Rilievo di fantasia: apri la pagina con la rete per vedere la montagna vera.</p>`);
    };
    paintPanorama($("#hero-canvas"), byId(TRIP.heroDest), { animate: !reduced, horizon: 0.5, peaksOnly: true }).then((result) => noteSynthetic($("#hero-canvas"), result));
    const jobs = new Map([
      // Ridges, hut and skis get a fine brush; the piste that meets the rail stays crisp.
      [$("#bar-canvas"), (canvas) => paintScene(canvas, $("#bar-art"), [[0, 0.08, 1, 0.5, true], [0.13, 0.4, 0.5, 0.38, true], [0.71, 0.54, 0.17, 0.26, true], [0, 0.72, 0.42, 0.16]]).catch(() => canvas.remove())],
      [$("#car-canvas"), (canvas) => paintScene(canvas, $("#car-art"), [[0, 0.82, 1, 0.18], [0, 0.1, 0.1, 0.8], [0.9, 0.1, 0.1, 0.8]]).catch(() => canvas.remove())],
    ]);
    document.querySelectorAll("[data-paint]").forEach((canvas) => jobs.set(canvas, () => {
      paintPanorama(canvas, byId(canvas.dataset.paint), { animate: !reduced }).then((result) => noteSynthetic(canvas, result));
    }));
    const observer = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((entry) => {
        observer.unobserve(entry.target);
        jobs.get(entry.target)(entry.target);
      });
    }, { rootMargin: "20% 0px" });
    jobs.forEach((_, canvas) => observer.observe(canvas));
  }

  function setupRail() {
    const svg = $("#rail");
    const path = svg.querySelector("path");
    const marker = svg.querySelector("circle");
    let length = 0;
    let h = innerHeight;
    const layout = () => {
      // Stops above the bottom nav so the marker can land in the bar scene.
      h = innerHeight - 60;
      svg.setAttribute("viewBox", `0 0 18 ${innerHeight}`);
      const bends = Math.ceil(h / 90);
      const bend = h / bends;
      let d = "M9 0";
      for (let i = 0; i < bends; i++) {
        d += ` Q${i % 2 ? 3 : 15} ${(i + 0.5) * bend} 9 ${(i + 1) * bend}`;
      }
      path.setAttribute("d", d);
      length = path.getTotalLength();
      path.style.strokeDasharray = length;
      update();
    };
    const update = () => {
      // The line ends on the piste drawn in the bar scene, 85% down it.
      const scene = $("#bar-art");
      const max = $("#bar").offsetTop + scene.getBoundingClientRect().height * 0.85 - h;
      const progress = max > 0 ? Math.min(1, scrollY / max) : 0;
      path.style.strokeDashoffset = length * (1 - progress);
      const point = path.getPointAtLength(length * progress);
      marker.setAttribute("cx", point.x);
      marker.setAttribute("cy", Math.max(7, point.y));
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", layout);
    layout();
  }

  function setupNav() {
    const nav = $("#bottom-nav");
    const links = [...nav.querySelectorAll("a")];
    const heroObserver = new IntersectionObserver(([entry]) => nav.classList.toggle("is-on", !entry.isIntersecting), { threshold: 0.35 });
    heroObserver.observe($("#top"));
    const observer = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((entry) => {
        links.forEach((a) => {
          if (a.getAttribute("href") === `#${entry.target.id}`) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main > section, footer").forEach((section) => observer.observe(section));
  }

  function setupPwa() {
    const status = $("#offline-status");
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) {
      status.textContent = "Su questo browser l'uso offline non è disponibile.";
    } else {
      navigator.serviceWorker.register("sw.js").catch(() => {
        status.textContent = "Il salvataggio offline non è riuscito: ricarica la pagina con la rete.";
      });
      navigator.serviceWorker.ready.then(() => {
        status.textContent = "Puoi aggiungere l'app alla schermata Home: si apre anche senza segnale, tranne il volo 3D. Per votare e salvare preventivi e alloggi serve la rete.";
      });
    }
    const install = $("#install");
    addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      install.hidden = false;
      // The button does the job, so the manual steps for iPhone are not needed here.
      $("#install-hint").hidden = true;
      install.onclick = () => {
        event.prompt();
        install.hidden = true;
      };
    });
  }

  setupMaterials();
  renderHero();
  renderCostObjection();
  renderDestinations();
  setupBudget();
  setupFlight();
  setupVote();
  setupLeave();
  setupLinks();
  setupPanoramas();
  setupRail();
  setupNav();
  setupPwa();
  renderers.push(renderHero, renderCostObjection, renderBudget);
  renderShared();
  setupGate();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && store.session) refreshShared();
  });
})();
