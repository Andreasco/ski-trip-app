// End-to-end check of the real page in headless Edge, against supabase/schema.sql on a real Postgres.
// First time: (cd tests && npm install). Run with: node tests/e2e.test.js
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

require("../js/data.js");
require("../js/budget.js");
const { TRIP, tripCost } = globalThis;

// Set E2E_SHOTS to a folder to save pictures of the gate and of the shared sections.
const SHOTS = process.env.E2E_SHOTS;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ROOT = path.join(__dirname, "..");
const PORT = 8766;
const CDP = 9336;
const BASE = `http://127.0.0.1:${PORT}/`;
const KEY = "test-publishable-key";
// Test values only, valid for this in-memory database.
const CODES = { alfa: "TEST2222", bravo: "TEST3333", charlie: "TEST4444", delta: "TEST5555" };
const PEOPLE = Object.fromEntries(Object.keys(CODES).map((id) => {
  const name = id[0].toUpperCase() + id.slice(1);
  return [id, { name, line: `${name}, questa è una frase di prova.` }];
}));
const TRIPS = [[2025, "Luogo Uno", 600], [2026, "Luogo Due", 450]];
const HIGH = 600;
// A lodging for three nights at each destination.
const HOUSES = { thorens: 900, alpe: 480, serre: 600, cervinia: 620 };
// The smallest valid WebP, 1x1.
const PIXEL = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const euro = (v) => `${Math.round(v).toLocaleString("it-IT", { useGrouping: "always" })} €`;
const dest = (id) => TRIP.destinations.find((d) => d.id === id);
const failures = [];
let passed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else failures.push(`${name}${detail === "" ? "" : ` -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};
const expected = (d, days, over = {}) => tripCost({
  ...TRIP.defaults.shared,
  days,
  km: d.trip.km,
  tolls: d.trip.tolls,
  nights: days - 1,
  flatTotal: (HOUSES[d.id] / 3) * (days - 1),
  pass: d.pass[days],
  ...over,
}).total;

const HELPERS = `
  window.$t = (s) => document.querySelector(s)?.textContent.trim();
  window.$set = (id, value) => {
    const el = document.getElementById(id);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  window.$pick = (name, value) => {
    const el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  window.$rank = () => [...document.querySelectorAll("#rank .rank-name")].map((e) => e.textContent);
  window.$until = async (test, ms = 5000) => {
    const t = performance.now();
    while (!test() && performance.now() - t < ms) await new Promise((r) => setTimeout(r, 40));
    return !!test();
  };
`;

async function startDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  // As on Supabase: objects belong to a non-superuser, and anon and authenticated get everything by default,
  // so the schema itself has to close the door.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role owner nologin;
    grant usage, create on schema public to owner; grant usage on schema public to anon, authenticated;
    alter default privileges for role owner in schema public grant all on tables to anon, authenticated;
    alter default privileges for role owner in schema public grant all on functions to anon, authenticated;
    alter default privileges for role owner in schema public grant all on sequences to anon, authenticated;
    set role owner;`);
  await db.exec(fs.readFileSync(path.join(ROOT, process.env.E2E_SCHEMA || "supabase/schema.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(ROOT, process.env.E2E_SCHEMA || "supabase/schema.sql"), "utf8")); // Safe to run again.
  await db.exec("reset role;");
  for (const [person, code] of Object.entries(CODES)) {
    await db.query("insert into people (id, code_hash, organizer) values ($1, $2, $3)", [person, crypto.createHash("sha256").update(code).digest("hex"), person === "alfa"]);
  }
  await db.exec("reset role;");
  return db;
}

// Asks as Supabase does: the anon role, calling functions by named arguments.
const rpc = (db, name, args) => db.transaction(async (tx) => {
  await tx.query("set local role anon");
  const keys = Object.keys(args);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const result = await tx.query(`select public.${name}(${list}) as result`, keys.map((k) => args[k]));
  return result.rows[0].result;
});

function startServer(db, net) {
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".geojson": "application/geo+json" };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    const call = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (call) {
      if (net.down) return req.socket.destroy();
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (net.hang) return undefined;
      const send = (status, body) => {
        // PostgREST answers a void function with an empty 204.
        if (body === null) {
          res.writeHead(204);
          return res.end();
        }
        res.writeHead(status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(body));
      };
      if (req.headers.apikey !== KEY) return send(401, { message: "no_key" });
      try {
        return send(200, await rpc(db, call[1], JSON.parse(raw)));
      } catch (error) {
        return send(400, { message: error.message });
      }
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    let body = fs.readFileSync(file);
    if (url.pathname === "/js/store.js") {
      // The tests must never reach the real project.
      const local = body.toString().replace(/url: "[^"]*", publishableKey: "[^"]*"/, `url: "${BASE}", publishableKey: "${KEY}"`);
      if (local.includes("supabase.co")) throw new Error("store.js still points at the real project");
      body = local;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    return res.end(body);
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

(async () => {
  const net = { down: false };
  const db = await startDatabase();

  // Database rules, without the page
  const refused = async (name, action, message) => {
    try {
      await action();
      check(name, false, "was allowed");
    } catch (error) {
      check(name, !message || error.message.includes(message), error.message);
    }
  };
  for (const role of ["anon", "authenticated"]) {
    const asRole = (sql) => db.transaction(async (tx) => {
      await tx.query(`set local role ${role}`);
      return tx.query(sql);
    });
    for (const table of ["people", "quotes", "votes", "proposals", "past_trips", "photos", "houses"]) {
      await refused(`${role} cannot read ${table}`, () => asRole(`select * from ${table}`), "permission denied");
      await refused(`${role} cannot delete from ${table}`, () => asRole(`delete from ${table}`), "permission denied");
    }
    await refused(`${role} cannot write votes directly`, () => asRole("insert into votes (person, ranking, attending) values ('bravo', '{}', true)"), "permission denied");
    await refused(`${role} cannot call the internal lookup`, () => asRole("select person_from_code('x')"), "permission denied");
    await refused(`${role} cannot call the hash function`, () => asRole("select hash_code('x')"), "permission denied");
    await refused(`${role} cannot create tables`, () => asRole("create table hack (id int)"));
  }
  // Every function, whatever is added later: authenticated reaches none, anon only this list.
  const PUBLIC_FUNCTIONS = ["delete_house", "delete_proposal", "delete_quote", "login", "read_all", "read_photo", "save_house", "save_photo", "save_proposal", "save_quote", "save_vote", "set_official_house", "set_past_trip", "set_person", "set_proposal_status"];
  const grants = (await db.query(`select p.proname as name, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  check("authenticated can call no function", !grants.some((g) => g.auth), grants.filter((g) => g.auth).map((g) => g.name));
  check("anon can call only the public functions", grants.filter((g) => g.anon).map((g) => g.name).sort().join() === PUBLIC_FUNCTIONS.join(), grants.filter((g) => g.anon).map((g) => g.name).sort());
  const definers = (await db.query(`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')`)).rows;
  check("every definer function pins its search path", !definers.length, definers);

  // Upgrading a project already in use, from the schema first published.
  {
    const { PGlite } = await import("@electric-sql/pglite");
    const old = new PGlite();
    await old.exec(`create role anon nologin; create role authenticated nologin; create role owner nologin;
      grant usage, create on schema public to owner; grant usage on schema public to anon, authenticated;
      alter default privileges for role owner in schema public grant all on tables to anon, authenticated;
      alter default privileges for role owner in schema public grant all on functions to anon, authenticated;
      set role owner;`);
    await old.exec(fs.readFileSync(path.join(__dirname, "schema-v1.sql"), "utf8"));
    await old.exec("insert into people (id, code_hash, organizer) values ('a', hash_code('AAAA'), true)");
    await old.exec("insert into votes (person, ranking, attending) values ('a', '{alpe}', true)");
    await old.query("select save_quote('AAAA', $1::jsonb)", [JSON.stringify({ dest: "alpe", days: 4, people: 4, cars: 1, km: 1, consumption: 1, fuelPrice: 1, tolls: 1, flatTotal: 1, pass: 1, foodPerDay: 1, extras: 0 })]);
    await old.exec(fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8"));
    await old.exec("reset role; set role anon");
    const after = (await old.query("select read_all('AAAA') as r")).rows[0].r;
    check("an upgrade keeps votes and quotes, and adds the new data", after.votes.length === 1 && after.quotes.length === 1 && after.quotes[0].nights === null && Array.isArray(after.houses) && Array.isArray(after.photos), after);
    await old.close();
  }
  const open = (await db.query("select relname from pg_class where relname in ('people','quotes','votes','proposals','past_trips','photos','houses') and not relrowsecurity")).rows;
  check("row level security is on everywhere", !open.length, open);
  const content = (i) => ({ p_code: CODES.bravo, ...i });
  await refused("only the organizer sets a person", () => rpc(db, "set_person", content({ p_id: "bravo", p_name: "x", p_line: "x", p_position: 0 })), "not_allowed");
  await refused("only the organizer sets a past trip", () => rpc(db, "set_past_trip", content({ p_year: 2020, p_place: "x", p_cost: 1 })), "not_allowed");
  await refused("only the organizer adds a photo", () => rpc(db, "save_photo", content({ p_id: "x", p_year: 2020, p_alt: "x", p_width: 1, p_height: 1, p_position: 0, p_mime: "image/webp", p_data: PIXEL })), "not_allowed");
  for (const [i, [id, person]] of Object.entries(PEOPLE).entries()) {
    await rpc(db, "set_person", { p_code: CODES.alfa, p_id: id, p_name: person.name, p_line: person.line, p_position: i });
  }
  for (const [year, place, cost] of TRIPS) {
    await rpc(db, "set_past_trip", { p_code: CODES.alfa, p_year: year, p_place: place, p_cost: cost });
    await rpc(db, "set_past_trip", { p_code: CODES.alfa, p_year: year, p_place: place, p_cost: cost }); // Safe to run again.
  }
  // Pictures of the layout need real photos: only with E2E_SHOTS, and they stay in this in-memory database.
  const real = SHOTS && fs.existsSync(path.join(ROOT, "private", "content.json"))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, "private", "content.json"), "utf8")).photos : [];
  for (const [i, year] of [2025, 2025, 2026].entries()) {
    const photo = real[[0, 2, 3][i]];
    await rpc(db, "save_photo", { p_code: CODES.alfa, p_id: `foto-${i}`, p_year: year, p_alt: `Foto <b>${i}</b>`, p_width: photo?.width || 4, p_height: photo?.height || 3, p_position: i, p_mime: "image/webp", p_data: photo ? fs.readFileSync(path.join(ROOT, "private", "photos", photo.file)).toString("base64") : PIXEL });
  }
  // Lodgings
  const house = (over = {}) => ({ dest: "alpe", name: "Casa", zone: "", url: "", nights: 3, total: 300, note: "", ...over });
  for (const [what, change] of [["no name", { name: "   " }], ["a long name", { name: "x".repeat(81) }], ["0 nights", { nights: 0 }], ["half a night", { nights: 1.5 }], ["no price", { total: 0 }], ["NaN price", { total: "NaN" }], ["a script link", { url: "javascript:alert(1)" }], ["a plain http link", { url: "http://example.com" }], ["a data link", { url: "data:text/html,x" }], ["a long note", { note: "x".repeat(201) }], ["no destination", { dest: "" }]]) {
    await refused(`a lodging with ${what} is refused`, () => rpc(db, "save_house", { p_code: CODES.bravo, p_house: house(change) }));
  }
  await refused("a lodging needs a good code", () => rpc(db, "save_house", { p_code: "NOPE", p_house: house() }), "bad_code");
  const bravoHouse = await rpc(db, "save_house", { p_code: CODES.bravo, p_house: house({ url: "https://example.com/a" }) });
  const charlieHouse = await rpc(db, "save_house", { p_code: CODES.charlie, p_house: house() });
  await refused("nobody deletes another's lodging", () => rpc(db, "delete_house", { p_code: CODES.bravo, p_id: charlieHouse }), "not_allowed");
  await refused("only the organizer stars a lodging", () => rpc(db, "set_official_house", { p_code: CODES.bravo, p_id: bravoHouse }), "not_allowed");
  await refused("a star needs a real lodging", () => rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: "00000000-0000-0000-0000-000000000000" }), "not_found");
  const officials = async () => (await rpc(db, "read_all", { p_code: CODES.delta })).houses.filter((h) => h.official).map((h) => h.id);
  await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: bravoHouse });
  check("a star marks the lodging", (await officials()).join() === bravoHouse);
  await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: charlieHouse });
  check("a destination has only one star", (await officials()).join() === charlieHouse);
  await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: charlieHouse });
  check("a second tap takes the star away", !(await officials()).length);
  await rpc(db, "delete_house", { p_code: CODES.bravo, p_id: bravoHouse });
  await rpc(db, "delete_house", { p_code: CODES.alfa, p_id: charlieHouse });
  check("the author and the organizer can delete", !(await rpc(db, "read_all", { p_code: CODES.delta })).houses.length);
  for (const [id, total] of Object.entries(HOUSES)) {
    const created = await rpc(db, "save_house", { p_code: CODES.alfa, p_house: house({ dest: id, name: `Casa ${id}`, zone: "Zona prova", url: "https://example.com/casa", total }) });
    await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: created });
  }

  await refused("only image types are stored", () => rpc(db, "save_photo", { p_code: CODES.alfa, p_id: "x", p_year: 2020, p_alt: "x", p_width: 1, p_height: 1, p_position: 0, p_mime: "text/html", p_data: PIXEL }));
  await refused("a photo needs a good code", () => rpc(db, "read_photo", { p_code: "NOPE", p_id: "foto-0" }), "bad_code");
  check("a code reads a photo", (await rpc(db, "read_photo", { p_code: CODES.delta, p_id: "foto-0" })).startsWith("data:image/webp;base64,"));
  check("the data read at once has no picture bytes", !JSON.stringify(await rpc(db, "read_all", { p_code: CODES.delta })).includes(PIXEL));
  const greeted = await rpc(db, "login", { p_code: CODES.bravo });
  check("a code gives the name and the line", greeted.name === "Bravo" && greeted.line === PEOPLE.bravo.line);

  // The public files must never name the group. Skipped where private/ does not exist.
  const privatePath = path.join(ROOT, "private", "content.json");
  if (fs.existsSync(privatePath)) {
    const real = JSON.parse(fs.readFileSync(privatePath, "utf8"));
    const secrets = [...real.people.flatMap((x) => [x.name, x.line]), ...real.pastTrips.flatMap((x) => [x.place, `${x.cost} €`]), ...real.photos.map((x) => x.alt)];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (["node_modules", "private", ".git", ".impeccable", ".claude", "fonts", "vendor", "data"].includes(e.name)) return [];
      return e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)];
    });
    const ignored = ["discesa-codes.private.txt", "PRODUCT.md"];
    const leaks = walk(ROOT).filter((f) => !ignored.includes(path.basename(f)) && /\.(html|js|css|md|sql|json|webmanifest|txt)$/.test(f))
      .flatMap((f) => secrets.filter((x) => fs.readFileSync(f, "utf8").toLowerCase().includes(x.toLowerCase())).map((x) => `${path.relative(ROOT, f)}: ${x}`));
    check("the public files name nobody", !leaks.length, leaks);
    const ignoredByGit = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split(/\r?\n/);
    check("private files stay out of git", ["private/", "discesa-codes.private.txt", "PRODUCT.md"].every((x) => ignoredByGit.includes(x)));
  }

  for (const name of ["read_all", "login"]) {
    await refused(`${name} refuses a bad code`, () => rpc(db, name, { p_code: "NOPE" }), "bad_code");
    await refused(`${name} refuses an empty code`, () => rpc(db, name, { p_code: "" }), "bad_code");
    await refused(`${name} refuses a null code`, () => rpc(db, name, { p_code: null }), "bad_code");
  }
  await refused("a code is not a pattern", () => rpc(db, "login", { p_code: "' or 1=1 --" }), "bad_code");
  check("a code works typed by hand", (await rpc(db, "login", { p_code: "test-3333 " })).person === "bravo");
  const goodQuote = { note: "", dest: "alpe", days: 4, passOption: false, people: 4, cars: 1, km: 380, consumption: 7, fuelPrice: 2.02, tolls: 26, flatTotal: 1342, pass: 243, foodPerDay: 35, extras: 0 };
  for (const [what, change] of [["0 people", { people: 0 }], ["half a person", { people: 1.5 }], ["no cars", { cars: 0 }], ["negative km", { km: -1 }], ["NaN km", { km: "NaN" }], ["infinite tolls", { tolls: "Infinity" }], ["a long note", { note: "x".repeat(121) }], ["no destination", { dest: "" }], ["text as a number", { pass: "abc" }], ["a missing value", { extras: null }], ["0 days", { days: 0 }]]) {
    await refused(`a quote with ${what} is refused`, () => rpc(db, "save_quote", { p_code: CODES.bravo, p_quote: { ...goodQuote, ...change } }));
  }
  const alfaQuote = await rpc(db, "save_quote", { p_code: CODES.alfa, p_quote: goodQuote });
  await refused("nobody deletes another's quote", () => rpc(db, "delete_quote", { p_code: CODES.bravo, p_id: alfaQuote }), "not_allowed");
  await rpc(db, "delete_quote", { p_code: CODES.alfa, p_id: alfaQuote });
  await refused("a quote cannot be deleted twice", () => rpc(db, "delete_quote", { p_code: CODES.alfa, p_id: alfaQuote }), "not_allowed");
  await refused("an empty proposal is refused", () => rpc(db, "save_proposal", { p_code: CODES.bravo, p_text: "   " }));
  await refused("a long proposal is refused", () => rpc(db, "save_proposal", { p_code: CODES.bravo, p_text: "x".repeat(501) }));
  const proposal = await rpc(db, "save_proposal", { p_code: CODES.bravo, p_text: "prova" });
  await refused("only the organizer closes proposals", () => rpc(db, "set_proposal_status", { p_code: CODES.bravo, p_id: proposal, p_status: "accepted" }), "not_allowed");
  await refused("a status must exist", () => rpc(db, "set_proposal_status", { p_code: CODES.alfa, p_id: proposal, p_status: "maybe" }));
  await refused("nobody deletes another's proposal, not even the organizer", () => rpc(db, "delete_proposal", { p_code: CODES.alfa, p_id: proposal }), "not_allowed");
  await refused("a proposal cannot be deleted with a bad code", () => rpc(db, "delete_proposal", { p_code: "NOPE", p_id: proposal }), "bad_code");
  const spare = await rpc(db, "save_proposal", { p_code: CODES.bravo, p_text: "da togliere" });
  await rpc(db, "delete_proposal", { p_code: CODES.bravo, p_id: spare });
  await refused("a proposal cannot be deleted twice", () => rpc(db, "delete_proposal", { p_code: CODES.bravo, p_id: spare }), "not_allowed");
  await rpc(db, "set_proposal_status", { p_code: CODES.alfa, p_id: proposal, p_status: "accepted" });
  const first = await rpc(db, "read_all", { p_code: CODES.delta });
  check("everyone with a code reads the same data", first.proposals[0]?.status === "accepted" && first.proposals[0]?.text === "prova", first.proposals);
  check("people come in order", first.people.map((x) => x.id).join() === Object.keys(CODES).join(), first.people);
  check("codes never appear in what is read", !JSON.stringify(first).includes("code") && !JSON.stringify(first).includes("hash"));
  await db.exec("delete from proposals; delete from quotes; delete from votes;");

  const server = await startServer(db, net);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "discesa-e2e-"));
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, "--no-first-run", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === "page");
      } catch { /* still starting */ }
    }
    if (!target) throw new Error("no browser");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
    let id = 0;
    const waiting = new Map();
    const exceptions = [];
    const badResponses = [];
    let loaded = () => {};
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
      if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === "Page.loadEventFired") loaded();
      if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400 && msg.params.type !== "Fetch" && msg.params.response.url.startsWith(BASE)) badResponses.push(msg.params.response.url);
    };
    // A call that never answers fails the run instead of hanging it.
    const send = (method, params = {}) => new Promise((r, e) => {
      const n = ++id;
      const timer = setTimeout(() => e(new Error(`no answer: ${method} ${(params.expression || "").slice(0, 120)}`)), 90000);
      waiting.set(n, (msg) => { clearTimeout(timer); r(msg); });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
    const js = async (expression) => {
      const { result } = await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(`${expression}: ${result.exceptionDetails.exception?.description}`);
      return result.result?.value;
    };
    const go = async (url = "") => {
      const done = new Promise((r) => { loaded = r; });
      await send("Page.navigate", { url: BASE + url });
      await Promise.race([done, sleep(15000)]);
      await sleep(200);
    };
    const size = (width, height, mobile = true) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    const locked = () => js(`return document.documentElement.classList.contains("locked")`);
    const out = async () => {
      await js(`localStorage.clear();`);
      await go();
    };
    const login = async (person) => {
      await out();
      await go(`#k=${CODES[person]}`);
      await js(`document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked")); await $until(() => document.getElementById("voter-name").textContent);`);
      await sleep(150);
    };
    const settle = () => sleep(250);
    const shot = async (name) => {
      if (SHOTS) fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: HELPERS });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await size(375, 812);
    await go();
    await out();

    // The gate
    console.error(`[${Math.round(process.uptime())}s] The gate: ${passed} ok, ${failures.length} failed`);
    check("a new visitor meets the gate", await locked());
    const hidden = JSON.parse(await js(`
      const seen = (s) => getComputedStyle(document.querySelector(s)).visibility !== "hidden";
      return JSON.stringify({ title: seen(".cartouche"), signs: seen(".post"), main: seen("main"), footer: seen(".footer"), nav: seen("#bottom-nav"), gate: getComputedStyle(document.getElementById("gate")).display, canScroll: getComputedStyle(document.documentElement).overflow !== "hidden", focusable: [...document.querySelectorAll("a, button, input, select, textarea")].filter((e) => !e.closest("#gate") && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().height).length });`));
    check("nothing shows behind the gate", !hidden.title && !hidden.signs && !hidden.main && !hidden.footer && !hidden.nav && hidden.gate === "flex" && !hidden.canScroll && !hidden.focusable, hidden);
    check("the mountain paints behind the gate", await js(`return $until(() => document.getElementById("hero-canvas").dataset.painted, 15000)`));
    await shot("g01-gate-new-visitor");
    await js(`document.getElementById("gate-submit").click(); await $until(() => $t("#gate-status"));`);
    check("an empty code asks for one", (await js(`return $t("#gate-status")`)).includes("Scrivi"));
    await js(`document.getElementById("gate-code").value = "SBAGLIATO"; document.getElementById("gate-submit").click(); await $until(() => $t("#gate-status").includes("tornello"));`);
    check("a wrong code keeps the gate shut", (await locked()) && (await js(`return $t("#gate-status")`)).includes("non apre il tornello"));
    await shot("g02-gate-wrong-code");
    check("a wrong code can be retried", await js(`return !document.getElementById("gate-submit").disabled && document.getElementById("gate-submit").textContent === "Timbra lo skipass"`));
    check("nothing is saved after a wrong code", (await js(`return localStorage.getItem("discesa-session")`)) === null);
    net.down = true;
    await js(`document.getElementById("gate-code").value = "${CODES.bravo}"; document.getElementById("gate-submit").click(); await $until(() => $t("#gate-status").includes("impianti"));`);
    check("no network says so at the gate, and who to warn", (await locked()) && (await js(`return $t("#gate-status")`)).includes("avvisa chi organizza"));
    check("focus returns to the button after a network error", await js(`return document.activeElement.id === "gate-submit"`));
    net.down = false;
    net.hang = true;
    const hung = await js(`document.getElementById("gate-code").value = "${CODES.bravo}"; document.getElementById("gate-status").textContent = ""; const t = performance.now(); document.getElementById("gate-submit").click(); const busy = document.getElementById("gate-submit").disabled; await $until(() => $t("#gate-status"), 16000); return { busy, label: document.getElementById("gate-submit").textContent, ms: Math.round(performance.now() - t), status: $t("#gate-status") }`);
    check("a stuck request gives up", hung.busy && hung.ms < 14000 && hung.status.includes("impianti") && hung.label === "Timbra lo skipass", hung);
    net.hang = false;
    await js(`const f = document.getElementById("gate-code"); f.setAttribute("aria-invalid", "true"); f.dispatchEvent(new Event("input", { bubbles: true }));`);
    check("typing clears the error marks", await js(`return document.getElementById("gate-code").getAttribute("aria-invalid") === "false" && !$t("#gate-status")`));
    await js(`document.getElementById("gate-code").value = " test-3333 "; document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked"));`);
    check("a typed code opens the gate", !(await locked()));
    await settle();
    check("the page greets the person", (await js(`return $t("#personal")`)) === PEOPLE.bravo.line);
    check("the voter is named", (await js(`return $t("#voter-name")`)) === "Bravo");
    check("everything shows after the gate", await js(`return ["main", ".cartouche", ".post"].every((s) => getComputedStyle(document.querySelector(s)).visibility === "visible") && getComputedStyle(document.getElementById("gate")).display === "none"`));
    check("focus lands on the title", await js(`return document.activeElement.tagName === "H1"`));
    await go();
    check("the gate remembers", !(await locked()));
    await js(`document.getElementById("logout").click();`);
    await sleep(600);
    check("leaving brings the gate back", await locked());
    check("leaving forgets the code and the data", await js(`return !localStorage.getItem("discesa-session") && !localStorage.getItem("discesa-cache")`));

    // Personal links
    console.error(`[${Math.round(process.uptime())}s] Personal links: ${passed} ok, ${failures.length} failed`);
    for (const [person, code] of Object.entries(CODES)) {
      await out();
      await go(`#k=${code}`);
      check(`link for ${person} leaves the address`, (await js(`return location.href`)) === BASE, await js(`return location.href`));
      check(`link for ${person} needs one tap`, await js(`await $until(() => $t("#gate-name")); return document.getElementById("gate-field").hidden && $t("#gate-name") === "${PEOPLE[person].name}"`));
      check(`link for ${person} greets on the skipass`, (await js(`return $t("#gate-line")`)) === PEOPLE[person].line);
      await js(`document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked"));`);
      await settle();
      check(`line for ${person}`, (await js(`return $t("#personal")`)) === PEOPLE[person].line);
    }
    await out();
    await go(`?per=bravo#k=${CODES.delta}`);
    await js(`document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked"));`);
    await settle();
    check("an old link naming someone else still follows the code", (await js(`return $t("#voter-name")`)) === "Delta");
    await js(`location.hash = "k=${CODES.bravo}";`);
    await sleep(1200);
    check("a link tapped with the app open asks to stamp again", await locked());
    check("a link tapped with the app open leaves the address", !(await js(`return location.href`)).includes("#k="), await js(`return location.href`));
    await js(`await $until(() => document.getElementById("hero-canvas").dataset.painted, 15000);`);
    await shot("g03-gate-personal-link");
    await out();
    await go(`?per=bravo#k=SBAGLIATO`);
    await js(`document.getElementById("gate-submit").click(); await $until(() => $t("#gate-status"));`);
    check("a broken link offers the field", await js(`return !document.getElementById("gate-field").hidden && $t("#gate-status").includes("tornello")`));
    await out();
    check("no name shows before a code", await js(`return document.getElementById("gate-name").hidden && document.getElementById("gate-line").hidden`));
    check("nothing about the group is on the page before a code", await js(`return !document.body.textContent.includes("Luogo") && !document.body.textContent.includes("Bravo")`));

    // Figures shown everywhere match the data
    console.error(`[${Math.round(process.uptime())}s] Figures shown everywhere match the data: ${passed} ok, ${failures.length} failed`);
    await login("alfa");
    const signs = await js(`return [...document.querySelectorAll(".sign-data")].map((e) => e.textContent)`);
    TRIP.destinations.forEach((d, i) => {
      check(`sign figure ${d.id}`, signs[i].includes(`stima ${euro(expected(d, 4))}`), signs[i]);
      check(`sign drive ${d.id}`, signs[i].includes(d.drive), signs[i]);
    });
    for (const d of TRIP.destinations) {
      for (const days of [4, 5]) {
        await js(`$pick("dest", "${d.id}"); $pick("days", "${days}");`);
        check(`ledger ${d.id} ${days}d`, (await js(`return $t("#ledger-total")`)) === euro(expected(d, days)));
        check(`live total ${d.id} ${days}d`, (await js(`return $t("#live-total strong")`)) === euro(expected(d, days)));
        check(`group total ${d.id} ${days}d`, (await js(`return $t("#ledger-group")`)) === euro(expected(d, days) * 4));
      }
    }
    await js(`$pick("days", "4");`);
    const compare = await js(`return [...document.querySelectorAll("#compare strong")].map((e) => e.textContent)`);
    TRIP.destinations.forEach((d, i) => check(`compare ${d.id}`, compare[i] === euro(expected(d, 4)), compare[i]));
    const objection = await js(`return $t("#cost-objection")`);
    const totals = TRIP.destinations.map((d) => expected(d, 4));
    check("objection states the range", objection.includes(`da ${euro(Math.min(...totals))} a ${euro(Math.max(...totals))} a testa`), objection);
    check("objection names what goes over", objection.includes(`solo ${TRIP.destinations[0].name}`), objection);
    const cheapest = TRIP.destinations.map((d) => ({ d, total: expected(d, 4) })).sort((a, b) => a.total - b.total)[0];
    const heroCost = await js(`return $t("#hero-cost")`);
    check("hero offer states the cheapest quote", heroCost.includes(euro(cheapest.total)) && heroCost.includes(cheapest.d.at), heroCost);
    check("destinations run from the black down", TRIP.destinations.map((d) => d.grade).join() === "black,red,blue,green" && (await js(`return [...document.querySelectorAll("#dest-list h3")].map((h) => h.textContent.trim()).join()`)) === TRIP.destinations.map((d) => d.name).join());

    // Calculator
    console.error(`[${Math.round(process.uptime())}s] Calculator: ${passed} ok, ${failures.length} failed`);
    const first = TRIP.destinations[0];
    await js(`$pick("dest", "${first.id}");`);
    const total = () => js(`return $t("#live-total strong")`);
    const cases = [
      ["people", 3, { people: 3 }], ["cars", 2, { cars: 2 }], ["km", 500, { km: 500 }], ["consumption", 9, { consumption: 9 }],
      ["fuelPrice", 1.8, { fuelPrice: 1.8 }], ["tolls", 40, { tolls: 40 }], ["flat", 1000, { flatTotal: 1000 }], ["pass", 200, { pass: 200 }],
      ["nights", 5, { flatTotal: (HOUSES[first.id] / 3) * 5 }],
      ["foodPerDay", 50, { foodPerDay: 50 }], ["extras", 25, { extras: 25 }],
    ];
    for (const [field, value, over] of cases) {
      await js(`document.getElementById("budget-reset").click(); $set("${field}", "${value}");`);
      check(`field ${field} changes the total`, (await total()) === euro(expected(first, 4, over)), await total());
    }
    await js(`document.getElementById("budget-reset").click();`);
    check("reset restores the total", (await total()) === euro(expected(first, 4)));
    for (const [field, bad] of [["people", ""], ["people", "0"], ["people", "1.5"], ["people", "51"], ["nights", "0"], ["nights", "31"], ["cars", "0"], ["km", "-5"], ["consumption", "101"], ["flat", "1000001"], ["fuelPrice", ""]]) {
      await js(`document.getElementById("budget-reset").click(); $set("${field}", "${bad}");`);
      check(`invalid ${field}="${bad}" keeps the total`, (await total()) === euro(expected(first, 4)));
      check(`invalid ${field}="${bad}" shows an error`, await js(`return !document.getElementById("${field}-error").hidden`));
      await js(`const e = document.getElementById("${field}"); e.dispatchEvent(new Event("change", { bubbles: true }));`);
      check(`invalid ${field} clears on leaving`, await js(`return document.getElementById("${field}-error").hidden && document.getElementById("${field}").value !== "${bad}"`));
    }
    await js(`document.getElementById("budget-reset").click(); $set("people", "1");`);
    check("singular person in the caption", (await js(`return $t("#ledger-caption")`)).includes("1 persona"));
    await js(`document.getElementById("budget-reset").click(); $pick("dest", "cervinia");`);
    check("Zermatt option shows for Cervinia", await js(`return !document.getElementById("pass-option").hidden`));
    await js(`document.getElementById("pass-option-input").click();`);
    const cerv = dest("cervinia");
    check("Zermatt adds to the pass", (await total()) === euro(expected(cerv, 4, { pass: cerv.passOption.prices[4] })), await total());
    await js(`$pick("days", "5");`);
    check("Zermatt reprices with days", (await total()) === euro(expected(cerv, 5, { pass: cerv.passOption.prices[5] })), await total());
    await js(`$pick("dest", "alpe");`);
    check("Zermatt option hides elsewhere", await js(`return document.getElementById("pass-option").hidden`));
    await js(`$pick("dest", "cervinia");`);
    check("Zermatt resets on switching", (await total()) === euro(expected(cerv, 5)), await total());
    await js(`document.getElementById("budget-reset").click(); $pick("dest", "alpe"); $set("km", "100"); $pick("dest", "thorens");`);
    check("a typed km stays with its destination", (await js(`return document.getElementById("km").value`)) === String(dest("thorens").trip.km));
    await js(`document.getElementById("budget-reset").click();`);
    check("verdict above budget", (await js(`return $t("#verdict")`)).includes("sopra"));
    await js(`$pick("dest", "cervinia");`);
    check("verdict within the band", (await js(`return $t("#verdict")`)).includes("dentro la fascia"), await js(`return $t("#verdict")`));
    await js(`$set("people", "2");`);
    check("the comparison stays published while the calculator changes", (await js(`return $t("#compare strong")`)) === euro(expected(TRIP.destinations[0], 4)), await js(`return $t("#compare strong")`));
    await js(`document.getElementById("budget-reset").click();`);

    // Quotes, shared between people
    console.error(`[${Math.round(process.uptime())}s] Quotes, shared between people: ${passed} ok, ${failures.length} failed`);
    await login("bravo");
    const pending = await js(`document.getElementById("quote-note").value = '<img src=x onerror="window.__xss=1">';
      $pick("dest", "cervinia"); $pick("days", "5"); document.getElementById("pass-option-input").click(); $set("cars", "2"); $set("km", "300");
      const b = document.querySelector("#quote-form button"); const f = document.getElementById("quote-form");
      f.requestSubmit(); f.requestSubmit();
      const busy = { disabled: b.disabled, label: b.textContent };
      await $until(() => document.querySelector(".quote-total")); await $until(() => !b.disabled);
      return { ...busy, after: b.textContent };`);
    check("a save shows it is working", pending.disabled && pending.label === "Salvo…" && pending.after === "Salva il preventivo", pending);
    check("trying out figures does not change the published hero", (await js(`return $t("#hero-cost")`)) === heroCost, await js(`return $t("#hero-cost")`));
    check("trying out figures does not change the objection", (await js(`return $t("#cost-objection")`)) === objection, await js(`return $t("#cost-objection")`));
    await js(`document.dispatchEvent(new Event("visibilitychange")); await new Promise((r) => setTimeout(r, 300));`);
    check("returning to the app keeps the published hero", (await js(`return $t("#hero-cost")`)) === heroCost);
    check("the signs keep the published range", (await js(`return $t(".sign-data")`)) === signs[0].trim(), await js(`return $t(".sign-data")`));
    check("a double tap saves once", (await db.query("select 1 from quotes")).rows.length === 1, (await db.query("select count(*) from quotes")).rows);
    const savedTotal = euro(expected(cerv, 5, { pass: cerv.passOption.prices[5], cars: 2, km: 300 }));
    check("a quote is saved with its total", (await js(`return $t(".quote-total")`)) === savedTotal, await js(`return $t(".quote-total")`));
    check("a quote note is escaped", await js(`return !window.__xss && !document.querySelector("#quote-list img")`));
    check("the note field empties", (await js(`return document.getElementById("quote-note").value`)) === "");
    check("the author can delete it", await js(`return !!document.querySelector("[data-delete]")`));
    await login("charlie");
    check("another person sees the quote", (await js(`return $t("#quote-list strong")`)).startsWith("Bravo: Cervinia, 5 giorni"), await js(`return $t("#quote-list strong")`));
    check("the same total for everyone", (await js(`return $t(".quote-total")`)) === savedTotal);
    check("only the author can delete", await js(`return !document.querySelector("[data-delete]")`));
    await js(`document.getElementById("quote-list").scrollIntoView({ block: "center" });`);
    await settle();
    await shot("g10-saved-quote-seen-by-another");
    await js(`document.querySelector("[data-open]").click(); await new Promise((r) => setTimeout(r, 100));`);
    check("anyone can reopen it", (await total()) === savedTotal, await total());
    check("reopen restores the fields", await js(`return document.getElementById("cars").value === "2" && document.getElementById("km").value === "300" && document.getElementById("pass-option-input").checked && document.querySelector('input[name="days"]:checked').value === "5"`));
    await js(`$pick("days", "4");`);
    check("a reopened quote reprices by days", (await total()) === euro(expected(cerv, 4, { pass: cerv.passOption.prices[4], cars: 2, km: 300 })), await total());
    await login("bravo");
    await js(`document.querySelector("[data-delete]").click(); await $until(() => !document.querySelector("#quote-list li"));`);
    check("delete empties the list", await js(`return !document.querySelector("#quote-list li") && !document.getElementById("quote-empty").hidden`));

    // Lodgings, shared between people
    await login("bravo");
    const houseCount = () => js(`return document.querySelectorAll(".house-list li").length`);
    check("every destination's lodging is listed", (await houseCount()) === 4);
    check("lodgings come grouped by destination", (await js(`return [...document.querySelectorAll("#house-list h4")].map((h) => h.textContent.trim()).join()`)) === TRIP.destinations.map((d) => d.name).join());
    check("the star shows to everyone", (await js(`return document.querySelectorAll(".house-official").length`)) === 4);
    check("only the organizer can star", await js(`return !document.querySelector("[data-star]")`));
    check("nobody else's lodging can be deleted", await js(`return !document.querySelector("[data-drop]")`));
    check("an empty lodging form stays unsent", await js(`return !document.getElementById("house-form").checkValidity()`));
    await js(`document.getElementById("house-dest").value = "alpe";
      document.getElementById("house-name").value = '<img src=x onerror="window.__xss=1">';
      document.getElementById("house-zone").value = "<b>Zona</b>";
      document.getElementById("house-url").value = 'https://example.com/"><script>window.__xss=1</script>';
      document.getElementById("house-nights").value = "4";
      document.getElementById("house-total").value = "400";
      document.getElementById("house-note").value = "<i>nota</i>";
      const f = document.getElementById("house-form"); f.requestSubmit(); f.requestSubmit();
      await $until(() => $t("#house-status"));`);
    check("a lodging is saved once", (await db.query("select 1 from houses where total = 400")).rows.length === 1);
    check("a lodging's fields are escaped", await js(`return !window.__xss && !document.querySelector("#house-list img, #house-list b, #house-list i, #house-list script")`));
    check("the form clears after saving", (await js(`return document.getElementById("house-name").value`)) === "");
    check("a lodging can be deleted by its author", (await js(`return document.querySelectorAll("[data-drop]").length`)) === 1);
    const mine = await js(`const li = document.querySelector("[data-drop]").closest("li"); return { text: li.innerText.replace(/\\s+/g, " "), total: li.querySelector(".quote-total").firstChild.textContent, link: li.querySelector("a")?.href, rel: li.querySelector("a")?.rel }`);
    check("a lodging states who found it", mine.text.includes("Trovato da Bravo"), mine);
    check("a lodging's trip cost is brought to the trip's nights", mine.total === euro(expected(dest("alpe"), 4, { flatTotal: 300 })), mine);
    check("a lodging for other nights says it was brought to the trip's", mine.text.includes("riportato a 3 notti"), mine);
    check("a lodging's link stays safe", mine.link?.startsWith("https://example.com/") && mine.rel.includes("noopener") && mine.rel.includes("noreferrer"), mine);
    const alpeSign = () => js(`return document.querySelectorAll(".sign-data")[${TRIP.destinations.indexOf(dest("alpe"))}].textContent`);
    const alpePublished = `stima ${euro(expected(dest("alpe"), 4))}`;
    check("a star beats a cheaper lodging", (await alpeSign()).includes(alpePublished), await alpeSign());
    const untouched = await js(`return [...document.querySelectorAll(".sign-data")].map((e) => e.textContent).join()`);
    const publishedCompare = await js(`return [...document.querySelectorAll("#compare li")].map((l) => l.innerText).join()`);
    await js(`document.querySelector("[data-drop]").closest("li").querySelector("[data-use]").click(); await new Promise((r) => setTimeout(r, 100));`);
    check("use in the quote fills the calculator", (await js(`return document.querySelector('input[name="dest"]:checked').value + document.querySelector('input[name="days"]:checked').value + document.getElementById("nights").value + document.getElementById("flat").value`)) === "alpe54400", await js(`return document.getElementById("nights").value + "/" + document.getElementById("flat").value`));
    check("use in the quote prices it", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 5, { nights: 4, flatTotal: 400 })), await js(`return $t("#ledger-total")`));
    check("the bill names the lodging being tried", (await js(`return document.getElementById("ledger-body").textContent`)).includes("Zona"), await js(`return document.getElementById("ledger-body").textContent`));
    check("the bill links the lodging being tried", await js(`return !!document.querySelector("#ledger-body a[href^='https://example.com/']")`));
    check("trying a lodging says so where it lands", (await js(`return $t("#budget-status")`)).includes("è nel conto"));
    await js(`$pick("days", "4");`);
    check("a lodging being tried follows the days", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 4, { flatTotal: 300 })), await js(`return $t("#ledger-total")`));
    check("the flat field follows it, in cents", (await js(`return document.getElementById("flat").value`)) === "300");
    check("trying a lodging leaves the published figures alone", (await js(`return [...document.querySelectorAll(".sign-data")].map((e) => e.textContent).join()`)) === untouched);
    check("trying a lodging leaves the comparison alone", (await js(`return [...document.querySelectorAll("#compare li")].map((l) => l.innerText).join()`)) === publishedCompare);
    await js(`$set("flat", "111");`);
    check("typing a price overrides the lodging being tried", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 4, { flatTotal: 111 })), await js(`return $t("#ledger-total")`));
    check("the bill says the price was typed", (await js(`return document.getElementById("ledger-body").textContent`)).includes("inserito a mano"));
    await js(`document.getElementById("budget-reset").click();`);
    check("reset ends the trial", (await js(`return $t("#budget-status")`)) === "");

    // Saved while trying a lodging that is not the published one
    await js(`document.querySelector("[data-drop]").closest("li").querySelector("[data-use]").click(); await new Promise((r) => setTimeout(r, 100));
      $pick("dest", "alpe"); document.getElementById("quote-note").value = "prova"; document.getElementById("quote-form").requestSubmit(); await $until(() => document.querySelector("#quote-list li"));
      document.getElementById("budget-reset").click(); document.querySelector("[data-open]").click(); await new Promise((r) => setTimeout(r, 100));`);
    check("a reopened trial is still that lodging, not a typed price", !(await js(`return document.getElementById("ledger-body").textContent`)).includes("inserito a mano") && await js(`return !!document.querySelector("#ledger-body a[href^='https://example.com/']")`));
    await js(`$pick("days", "5");`);
    check("a reopened trial follows the days", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 5, { nights: 4, flatTotal: 400 })), await js(`return $t("#ledger-total")`));
    check("changing anything clears the message about the quote", (await js(`return $t("#budget-status")`)) === "");
    await js(`$pick("days", "4");`);
    check("and comes back with fewer days", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 4, { flatTotal: 300 })), await js(`return $t("#ledger-total")`));
    await js(`document.getElementById("budget-reset").click(); document.querySelector("[data-delete]").click(); await $until(() => !document.querySelector("#quote-list li"));`);

    const compareNote = await js(`return $t("#compare-note")`);
    check("the comparison states what it is based on", compareNote.includes("3 notti, 4 giorni, 4 persone e 1 auto"), compareNote);

    // Star, stand-in and removal: Bravo's lodging is cheapest per night, a dearer unstarred one is added too.
    const dearer = await rpc(db, "save_house", { p_code: CODES.charlie, p_house: { dest: "alpe", name: "Casa cara", nights: 3, total: 5000 } });
    await login("alfa");
    const bravoRow = `[...document.querySelectorAll("[data-star]")].find((x) => x.closest("li").textContent.includes("Trovato da Bravo"))`;
    check("the organizer's action says what it does", (await js(`return ${bravoRow}.textContent`)) === "Segna come riferimento");
    await js(`${bravoRow}.click(); await $until(() => $t("#house-status").includes("riferimento"));`);
    const starredTotal = tripCost({ ...TRIP.defaults.shared, days: 4, nights: 3, km: dest("alpe").trip.km, tolls: dest("alpe").trip.tolls, pass: dest("alpe").pass[4], flatTotal: 300 }).total;
    check("the star sets the published figures", (await alpeSign()).includes(`stima ${euro(starredTotal)}`), await alpeSign());
    check("the star moves, leaving one per destination", (await db.query("select 1 from houses where dest = 'alpe' and official")).rows.length === 1);
    check("focus does not fall off the page after starring", await js(`return document.activeElement.id === "house-status"`));
    await js(`${bravoRow}.click(); await $until(() => document.querySelectorAll(".house-official").length === 3);`);
    check("without a star the cheapest per night stands in", (await alpeSign()).includes(`stima ${euro(starredTotal)}`), await alpeSign());
    const bravoId = (await db.query("select id from houses where total = 400")).rows[0].id;
    await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: bravoId });
    await login("bravo");
    await js(`const row = document.querySelector("[data-drop]").closest("li"); row.querySelector("[data-use]").click(); await new Promise((r) => setTimeout(r, 100));`);
    check("the message about a trial is there before its lodging goes", (await js(`return $t("#budget-status")`)).includes("è nel conto"));
    await js(`document.querySelector("[data-drop]").click(); await $until(() => document.querySelectorAll(".house-list li").length === 5);`);
    check("deleting the lodging being tried clears the message", (await js(`return $t("#budget-status")`)) === "", await js(`return $t("#budget-status")`));
    check("a friend can delete their own starred lodging", (await db.query("select 1 from houses where total = 400")).rows.length === 0);
    check("then the cheapest of the others stands in", (await alpeSign()).includes(alpePublished), await alpeSign());
    await rpc(db, "delete_house", { p_code: CODES.alfa, p_id: dearer });
    const alpeStar = (await db.query("select id from houses where dest = 'alpe'")).rows[0].id;
    await rpc(db, "set_official_house", { p_code: CODES.alfa, p_id: alpeStar });

    // A lodging on a destination no longer in the trip
    const orphan = await rpc(db, "save_house", { p_code: CODES.bravo, p_house: { dest: "vecchia", name: "Casa orfana", nights: 3, total: 1 } });
    await login("bravo");
    const orphanView = await js(`const li = [...document.querySelectorAll(".house-list li")].find((x) => x.textContent.includes("Casa orfana")); return { shown: !!li, use: !!li?.querySelector("[data-use]"), drop: !!li?.querySelector("[data-drop]"), signs: [...document.querySelectorAll(".sign-data")].map((e) => e.textContent).join() }`);
    check("an orphan lodging is listed, and can only be removed", orphanView.shown && !orphanView.use && orphanView.drop, orphanView);
    check("an orphan lodging changes no figure", orphanView.signs === untouched, orphanView);
    await rpc(db, "delete_house", { p_code: CODES.bravo, p_id: orphan });

    // Only some destinations have a lodging
    const serreRows = (await db.query("select * from houses where dest = 'serre'")).rows;
    await db.exec("delete from houses where dest = 'serre'");
    await go();
    const partial = await js(`await $until(() => $t("#cost-objection").includes("manca")); const rows = [...document.querySelectorAll("#compare li")]; const row = rows[${TRIP.destinations.indexOf(dest("serre"))}];
      $pick("dest", "serre"); await new Promise((r) => setTimeout(r, 50));
      return { number: row.querySelector("strong").textContent, label: row.querySelector("small").textContent, sign: document.querySelectorAll(".sign-data")[${TRIP.destinations.indexOf(dest("serre"))}].textContent, objection: $t("#cost-objection"), live: $t("#live-total small"), total: $t("#ledger-total-label"), verdict: $t("#verdict"), gauge: document.getElementById("gauge").hidden }`);
    check("the gauge places no mark for a total without a lodging", partial.gauge, partial);
    check("no price is shown for a destination without a lodging", partial.number === "" && partial.label === "Casa da scegliere" && partial.sign.includes("casa da scegliere"), partial);
    check("the objection says which destinations it counts", partial.objection.includes("manca ancora per Serre Chevalier") && !partial.objection.includes("tutte"), partial);
    check("the calculator says the total has no lodging", partial.live.includes("senza alloggio") && partial.total.includes("senza alloggio") && partial.verdict.includes("Manca"), partial);
    await js(`document.getElementById("quote-note").value = "senza casa"; document.getElementById("quote-form").requestSubmit(); await $until(() => document.querySelector("#quote-list li"));`);
    check("a quote saved without a lodging says so", (await js(`return $t("#quote-list small")`)).includes("Senza alloggio"), await js(`return $t("#quote-list small")`));
    await js(`document.querySelector("[data-delete]").click(); await $until(() => !document.querySelector("#quote-list li"));`);
    for (const row of serreRows) {
      await db.query("insert into houses (id, person, dest, name, zone, url, nights, total, note, official) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [row.id, row.person, row.dest, row.name, row.zone, row.url, row.nights, row.total, row.note, row.official]);
    }

    // Only one destination has a lodging
    const others = (await db.query("select * from houses where dest <> 'alpe'")).rows;
    await db.exec("delete from houses where dest <> 'alpe'");
    await go();
    const lone = await js(`await $until(() => $t("#cost-objection").includes("manca")); return $t("#cost-objection")`);
    check("the objection reads right with one destination priced", lone.includes(`Alpe d'Huez costa ${euro(expected(dest("alpe"), 4))}`) && !lone.includes("si va da") && lone.includes("Oggi sta entro"), lone);
    for (const row of others) {
      await db.query("insert into houses (id, person, dest, name, zone, url, nights, total, note, official) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [row.id, row.person, row.dest, row.name, row.zone, row.url, row.nights, row.total, row.note, row.official]);
    }

    // A quote from before nights were saved
    await rpc(db, "save_quote", { p_code: CODES.bravo, p_quote: { dest: "alpe", days: 5, people: 4, cars: 1, km: 380, consumption: 7, fuelPrice: 2.02, tolls: 26, flatTotal: (HOUSES.alpe / 3) * 4, pass: 301.5, foodPerDay: 35, extras: 0, note: "vecchio" } });
    await go();
    await js(`await $until(() => document.querySelector("[data-open]")); document.querySelector("[data-open]").click(); await new Promise((r) => setTimeout(r, 100));`);
    check("reopening an old quote works out its nights", (await js(`return document.getElementById("nights").value`)) === "4", await js(`return document.getElementById("nights").value`));
    check("reopening an old quote gives its total", (await js(`return $t("#ledger-total")`)) === euro(expected(dest("alpe"), 5)), await js(`return $t("#ledger-total")`));
    check("reopening says so where it lands", (await js(`return $t("#budget-status")`)).includes("riaperto"));
    await js(`document.getElementById("budget-reset").click();`);
    await db.exec("delete from quotes");

    const emptied = await db.query("select * from houses");
    await db.exec("delete from houses");
    await go();
    await js(`await $until(() => $t("#house-empty") !== undefined && !document.getElementById("house-empty").hidden);`);
    const noHouses = await js(`return { signs: $t(".sign-data"), compare: $t("#compare small"), verdict: $t("#verdict"), hero: $t("#hero-cost"), objection: $t("#cost-objection"), ledger: document.getElementById("ledger-body").textContent }`);
    check("no lodging at all stays honest", noHouses.signs.includes("casa da scegliere") && noHouses.compare === "Casa da scegliere" && noHouses.verdict.includes("Manca") && !noHouses.hero && noHouses.objection.includes("Appena") && noHouses.ledger.includes("Nessun alloggio"), noHouses);
    for (const row of emptied.rows) {
      await db.query("insert into houses (id, person, dest, name, zone, url, nights, total, note, official) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [row.id, row.person, row.dest, row.name, row.zone, row.url, row.nights, row.total, row.note, row.official]);
    }

    // Votes and proposals, shared between people
    console.error(`[${Math.round(process.uptime())}s] Votes and proposals, shared between people: ${passed} ok, ${failures.length} failed`);
    const base = TRIP.destinations.map((d) => d.name);
    await login("alfa");
    check("no results before the first vote", await js(`return document.getElementById("vote-results").hidden`));
    check("a first vote starts from the default order", JSON.stringify(await js(`return $rank()`)) === JSON.stringify(base));
    for (let i = 0; i < 3; i++) await js(`document.querySelector('[data-move="cervinia"][data-by="-1"]').click();`);
    check("arrows reorder", (await js(`return $rank()`))[0] === "Cervinia");
    check("the first row cannot go higher", await js(`return document.querySelector('[data-move="cervinia"][data-by="-1"]').disabled`));
    await js(`document.getElementById("save-vote").click(); await $until(() => $t("#vote-status"));`);
    check("the vote is confirmed", (await js(`return $t("#vote-status")`)).includes("Voto salvato"));
    const tally = () => js(`return [...document.querySelectorAll("#vote-tally li")].map((l) => l.innerText.replace(/\\s+/g, " "))`);
    check("first choice scores 4", (await tally())[0] === "Cervinia 4 punti", await tally());
    await js(`document.querySelector('[data-move="alpe"][data-by="-1"]').click();`);
    check("moving after saving clears the confirmation", (await js(`return $t("#vote-status")`)) === "");
    await login("bravo");
    check("a new voter never inherits an order", JSON.stringify(await js(`return $rank()`)) === JSON.stringify(base), await js(`return $rank()`));
    check("others' votes are visible", (await tally())[0] === "Cervinia 4 punti", await tally());
    await js(`document.getElementById("save-pass").click(); await $until(() => $t("#vote-status"));`);
    check("a pass is confirmed", (await js(`return $t("#vote-status")`)).includes("stavolta passi"));
    check("a pass scores nothing", (await tally())[0] === "Cervinia 4 punti", await tally());
    check("a pass shows on the seat", (await js(`return [...document.querySelectorAll("#seats li")].find((l) => l.textContent.includes("Bravo")).textContent`)).includes("Stavolta passa"));
    await login("charlie");
    await js(`document.getElementById("save-vote").click(); await $until(() => $t("#vote-status"));`);
    await js(`document.getElementById("vota").scrollIntoView(); await $until(() => document.getElementById("car-canvas").dataset.painted, 8000); await new Promise((r) => setTimeout(r, 900));`);
    await shot("g11-car-and-tally");
    check("votes add up", JSON.stringify(await tally()) === JSON.stringify(["Val Thorens / Orelle 7 punti", "Alpe d'Huez 5 punti", "Cervinia 5 punti", "Serre Chevalier 3 punti"]), await tally());
    await login("alfa");
    check("a voter finds their own ranking", (await js(`return $rank()`))[0] === "Cervinia", await js(`return $rank()`));
    await js(`document.getElementById("save-vote").click(); await $until(() => $t("#vote-status"));`);
    await rpc(db, "save_vote", { p_code: CODES.alfa, p_ranking: ["cervinia", "alpe", "thorens"], p_attending: true });
    await go();
    const oldVote = await js(`await $until(() => $t("#vote-status").includes("manca")); return { rank: $rank(), status: $t("#vote-status"), people: $t("#vote-people") + [...document.querySelectorAll("#vote-people li")].map((l) => l.textContent).join() }`);
    check("a vote from before a destination was added keeps its order", oldVote.rank.join() === "Cervinia,Alpe d'Huez,Val Thorens / Orelle,Serre Chevalier", oldVote);
    check("and says what is missing", oldVote.status.includes("manca Serre Chevalier") && oldVote.people.includes("(manca Serre Chevalier)"), oldVote);
    check("voting again replaces the vote", (await db.query("select 1 from votes where person = 'alfa'")).rows.length === 1);
    await js(`document.querySelector('[data-move="alpe"][data-by="-1"]').click();`);
    const moved = await js(`return $rank()`);
    await rpc(db, "save_vote", { p_code: CODES.delta, p_ranking: ["thorens"], p_attending: true });
    await js(`document.dispatchEvent(new Event("visibilitychange")); await $until(() => document.querySelectorAll("#vote-people li").length === 4);`);
    check("returning to the app shows others' news", (await js(`return document.querySelectorAll("#vote-people li").length`)) === 4);
    check("news does not undo the order being set", JSON.stringify(await js(`return $rank()`)) === JSON.stringify(moved));

    await js(`document.getElementById("proposal-form").requestSubmit(); await $until(() => $t("#proposal-status"));`);
    check("an empty proposal is refused here too", (await js(`return $t("#proposal-status")`)).includes("Scrivi"));
    await login("bravo");
    await js(`document.getElementById("proposal-text").value = '<b>Partiamo</b> prima'; document.getElementById("proposal-form").requestSubmit(); await $until(() => document.querySelector("#proposal-list li"));`);
    check("a proposal is listed and escaped", await js(`return $t("#proposal-list span") === "<b>Partiamo</b> prima" && !document.querySelector("#proposal-list b")`));
    check("a proposal starts in discussion", (await js(`return $t("#proposal-list small")`)).startsWith("In discussione"));
    check("only the organizer sees the status buttons", await js(`return !document.querySelector("[data-status]")`));
    check("the author can delete their proposal", await js(`return $t("[data-remove]") === "Elimina"`));
    await login("alfa");
    check("the organizer sees the status buttons", await js(`return document.querySelectorAll("[data-status]").length === 2`));
    check("the organizer cannot delete someone else's proposal", await js(`return !document.querySelector("[data-remove]")`));
    await js(`document.querySelector(".vote").scrollIntoView();`);
    await settle();
    await shot("g07-vote-as-organizer");
    await js(`document.querySelector("#proposal-list").scrollIntoView({ block: "center" });`);
    await settle();
    await shot("g08-proposal-organizer-buttons");
    check("the buttons name the action", (await js(`return $t('[data-status="accepted"]')`)) === "Accogli" && (await js(`return $t('[data-status="rejected"]')`)) === "Scarta");
    await js(`document.querySelector('[data-status="accepted"]').click(); await $until(() => $t("#proposal-list small").startsWith("Accolta"));`);
    check("the organizer can accept", (await js(`return $t("#proposal-list small")`)).startsWith("Accolta"));
    check("the current status cannot be chosen again", await js(`return document.querySelector('[data-status="accepted"]').disabled`));
    await login("delta");
    check("the decision reaches everyone", (await js(`return $t("#proposal-list small")`)).startsWith("Accolta"));
    check("someone else sees no delete button", await js(`return !document.querySelector("[data-remove]")`));
    await login("bravo");
    await js(`document.getElementById("proposal-text").value = "da togliere"; document.getElementById("proposal-form").requestSubmit(); await $until(() => document.querySelectorAll("#proposal-list li").length === 2);`);
    await js(`document.querySelector("[data-remove]").click(); await $until(() => $t("#proposal-status") === "Proposta eliminata.");`);
    check("deleting removes only that proposal", (await js(`return document.querySelectorAll("#proposal-list li").length`)) === 1 && (await js(`return $t("#proposal-list span")`)) !== "da togliere", await js(`return $t("#proposal-list span")`));

    // Failures must say so
    console.error(`[${Math.round(process.uptime())}s] Failures must say so: ${passed} ok, ${failures.length} failed`);
    await login("bravo");
    net.down = true;
    await js(`document.getElementById("save-vote").click(); await $until(() => $t("#vote-status"));`);
    check("a failed vote says so", (await js(`return $t("#vote-status")`)).includes("Non sono riuscito") && (await js(`return document.getElementById("save-vote").textContent`)) === "Ci sto, salva il voto");
    await js(`document.getElementById("quote-note").value = "tienimi"; document.getElementById("quote-form").requestSubmit(); await $until(() => $t("#quote-status"));`);
    check("a failed quote says so and keeps the note", (await js(`return $t("#quote-status")`)).includes("Non sono riuscito") && (await js(`return document.getElementById("quote-note").value`)) === "tienimi");
    await js(`document.getElementById("proposal-text").value = "x"; document.getElementById("proposal-form").requestSubmit(); await $until(() => $t("#proposal-status"));`);
    check("a failed proposal says so and keeps the text", (await js(`return $t("#proposal-status")`)).includes("Non sono riuscito") && (await js(`return document.getElementById("proposal-text").value`)) === "x");
    net.down = false;
    const refusal = await js(`const f = window.fetch; window.fetch = async () => new Response(JSON.stringify({ message: "new row violates check constraint" }), { status: 400 });
      document.getElementById("vote-status").textContent = ""; document.getElementById("save-vote").click(); await $until(() => $t("#vote-status")); window.fetch = f; return $t("#vote-status")`);
    check("a refused save does not blame the network", refusal.includes("rifiutato") && !refusal.includes("rete"), refusal);
    net.down = true;
    await go();
    await js(`await $until(() => $t("#votes-note").includes("Non riesco ad aggiornare"));`);
    check("no network shows the last data and says so", (await js(`return $t("#votes-note")`)).includes("Non riesco ad aggiornare") && (await js(`return document.querySelectorAll("#proposal-list li").length`)) === 1);
    check("a network failure does not end the session", !(await locked()));
    net.down = false;
    await db.query("update people set code_hash = 'changed' where id = 'bravo'");
    await go("?per=bravo");
    await sleep(800);
    check("a withdrawn code goes back to the gate", await locked());
    check("a withdrawn code explains itself", (await js(`return $t("#gate-status")`)).includes("è cambiato"), await js(`return $t("#gate-status")`));
    check("a withdrawn code leaves a clean address", !(await js(`return location.href`)).includes("#"));
    check("a withdrawn code forgets the data", await js(`return !localStorage.getItem("discesa-session") && !localStorage.getItem("discesa-cache")`));
    await db.query("update people set code_hash = $1 where id = 'bravo'", [crypto.createHash("sha256").update(CODES.bravo).digest("hex")]);

    // Older iPhones have no AbortSignal.timeout
    const old = await send("Page.addScriptToEvaluateOnNewDocument", { source: "delete AbortSignal.timeout;" });
    await out();
    await go(`?per=bravo#k=${CODES.bravo}`);
    check("the test really removed the timeout", await js(`return !AbortSignal.timeout`));
    await js(`document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked"));`);
    check("an older iPhone can still enter", !(await locked()));
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: old.result.identifier });

    // Blocked storage: the gate works for this visit
    console.error(`[${Math.round(process.uptime())}s] Blocked storage: the gate works for this visit: ${passed} ok, ${failures.length} failed`);
    const blocker = await send("Page.addScriptToEvaluateOnNewDocument", { source: `Storage.prototype.getItem = () => { throw new Error("blocked"); }; Storage.prototype.setItem = () => { throw new Error("blocked"); }; Storage.prototype.removeItem = () => { throw new Error("blocked"); };` });
    await go();
    check("blocked storage still shows the gate", await locked());
    await js(`document.getElementById("gate-code").value = "${CODES.bravo}"; document.getElementById("gate-submit").click(); await $until(() => !document.documentElement.classList.contains("locked"));`);
    check("blocked storage can still enter", !(await locked()));
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: blocker.result.identifier });

    // Markup
    console.error(`[${Math.round(process.uptime())}s] Markup: ${passed} ok, ${failures.length} failed`);
    await login("alfa");
    const markup = JSON.parse(await js(`
      const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
      const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
      const unlabelled = [...document.querySelectorAll("input, select, textarea")].filter((e) => !e.closest("label") && !document.querySelector('label[for="' + e.id + '"]')).map((e) => e.id || e.name);
      const dead = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href")).filter((h) => !document.querySelector(h));
      return JSON.stringify({ dupes, unlabelled, dead });`));
    check("no duplicate ids", !markup.dupes.length, markup.dupes);
    check("every field has a label", !markup.unlabelled.length, markup.unlabelled);
    check("no dead anchors", !markup.dead.length, markup.dead);
    const shownHidden = await js(`return [...document.querySelectorAll("[hidden]")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.id || e.className)`);
    check("what is hidden stays hidden", !shownHidden.length, shownHidden);
    // The test browser may really offer installation, so the starting state is set here.
    const install = await js(`const b = document.getElementById("install"); const h = document.getElementById("install-hint"); b.hidden = true; h.hidden = false; const before = getComputedStyle(b).display; const guide = getComputedStyle(h).display;
      window.dispatchEvent(new Event("beforeinstallprompt"));
      const after = getComputedStyle(b).display; const guideAfter = getComputedStyle(h).display; b.hidden = true;
      return { before, after, guide, guideAfter }`);
    check("the install button shows only when the browser offers it", install.before === "none" && install.after !== "none", install);
    check("the iPhone steps show only without the button", install.guide !== "none" && install.guideAfter === "none", install);

    // Navigation and the remaining sections
    console.error(`[${Math.round(process.uptime())}s] Navigation and the remaining sections: ${passed} ok, ${failures.length} failed`);
    await js(`document.querySelector('[data-budget="thorens"]').click(); await new Promise((r) => setTimeout(r, 200));`);
    check("Fai il conto selects the destination", (await js(`return document.querySelector('input[name="dest"]:checked').value`)) === "thorens");
    const nav = (want) => `const t = performance.now(); const n = document.getElementById("bottom-nav"); while (n.classList.contains("is-on") !== ${want} && performance.now() - t < 4000) await new Promise((r) => setTimeout(r, 50)); return { on: n.classList.contains("is-on"), y: scrollY, ms: Math.round(performance.now() - t) };`;
    const onHero = await js(`scrollTo({ top: 0, behavior: "instant" }); ${nav(false)}`);
    check("bottom nav is hidden on the hero", !onHero.on, onHero);
    const offHero = await js(`document.getElementById("mete").scrollIntoView(); ${nav(true)}`);
    check("bottom nav appears after the hero", offHero.on, offHero);
    for (const section of ["conto", "vota", "parti"]) {
      check(`nav marks ${section}`, await js(`document.getElementById("${section}").scrollIntoView(); return $until(() => document.querySelector('#bottom-nav a[aria-current]')?.getAttribute("href") === "#${section}", 3000)`));
    }
    await js(`const box = document.querySelector('#checklist input[data-index="2"]'); box.click();`);
    await go();
    check("checklist survives a reload", await js(`return document.querySelector('#checklist input[data-index="2"]').checked`));
    for (const d of TRIP.destinations) {
      const status = await js(`document.querySelector('[data-map="${d.id}"]').click(); await new Promise((r) => setTimeout(r, 500)); return $t("#piste-status")`);
      check(`piste map ${d.id}`, status.includes(d.name), status);
    }
    await js(`const f = window.fetch; window.fetch = () => Promise.reject(new Error("offline")); document.querySelector('[data-map="alpe"]').click(); await new Promise((r) => setTimeout(r, 200)); window.fetch = f;`);
    check("a missing piste map says so", (await js(`return $t("#piste-status")`)).includes("non è ancora salvata"));
    check("route list shows every destination", (await js(`return document.querySelectorAll("#route li").length`)) === TRIP.destinations.length);
    const painted = await js(`for (const c of document.querySelectorAll("[data-paint], #bar-canvas, #car-canvas")) { c.scrollIntoView(); const t = performance.now(); while (!c.dataset.painted && performance.now() - t < 15000) await new Promise((r) => setTimeout(r, 50)); }
      return [...document.querySelectorAll("canvas[data-paint], #hero-canvas, #bar-canvas, #car-canvas")].map((c) => c.dataset.painted || c.id || c.dataset.paint)`);
    check("every painting lands", painted.every((v) => v === "true"), painted);
    const labelled = await js(`return Object.fromEntries([...document.querySelectorAll("[data-paint]")].map((c) => [c.dataset.paint, Number(c.dataset.labels)]))`);
    check("every plate names at least two places on a phone", Object.values(labelled).every((n) => n >= 2), labelled);
    if (SHOTS) {
      for (const d of TRIP.destinations) {
        await js(`document.getElementById("${d.id}").scrollIntoView();`);
        await settle();
        await shot(`g14-plate-${d.id}`);
      }
      await js(`document.getElementById("house-form").scrollIntoView(); scrollBy(0, -110);`);
      await settle();
      await shot("g15-house-form");
      await js(`document.getElementById("house-list").scrollIntoView(); scrollBy(0, -110);`);
      await settle();
      await shot("g16-house-list");
      await js(`scrollTo(0, 0);`);
      await settle();
      await shot("g17-hero-four-signs");
    }
    check("no fallback relief with the bundled data", await js(`return !document.querySelector(".plate-note")`));
    const past = await js(`return [...document.querySelectorAll("#past li")].map((l) => l.innerText.replace(/\\s+/g, " "))`);
    check("past trips come from the database", past.length === 3 && past[0].includes("Luogo Uno") && past[0].includes("600 €") && past[2].includes("Da decidere"), past);
    check("seats come from the database", (await js(`return document.querySelectorAll("#seats li").length`)) === 4);
    const gallery = await js(`document.getElementById("photos").scrollIntoView({ block: "center" });
      await $until(() => [...document.querySelectorAll("#photos img")].every((i) => i.src && i.complete), 5000);
      return { titles: [...document.querySelectorAll("#photos h3")].map((h) => h.textContent), rows: [...document.querySelectorAll(".prints")].map((r) => r.children.length), loaded: [...document.querySelectorAll("#photos img")].every((i) => i.naturalWidth > 0), alt: document.querySelector("#photos img").alt, bold: !!document.querySelector("#photos b"), note: document.getElementById("photos-note").hidden }`);
    await js(`document.getElementById("storia").scrollIntoView();`);
    await settle();
    await shot("g12-past-trips");
    await js(`document.getElementById("photos").scrollIntoView();`);
    await settle();
    await shot("g13-photos");
    check("photos come grouped by trip", gallery.titles.join() === "Luogo Uno, 2025,Luogo Due, 2026" && gallery.rows.join() === "2,1", gallery);
    check("photos load, with their description", gallery.loaded && gallery.alt === "Foto <b>0</b>" && !gallery.bold && gallery.note, gallery);
    const covered = await js(`const out = [];
      for (const s of ["#save-vote", "#save-pass", "#save-proposal", "#logout", "#quote-form button", "#house-form button", "#budget-reset", "#flight-start", ".dest-actions .btn"]) {
        const e = document.querySelector(s);
        if (!e) continue;
        e.scrollIntoView({ block: "center" });
        await new Promise((r) => setTimeout(r, 80));
        const b = e.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (!(hit === e || e.contains(hit))) out.push(s + " under " + (hit?.id || hit?.className || hit?.tagName));
      }
      return out`);
    check("key buttons are not covered", !covered.length, covered);

    // Flight
    console.error(`[${Math.round(process.uptime())}s] Flight: ${passed} ok, ${failures.length} failed`);
    for (const d of TRIP.destinations) {
      const state = await js(`document.getElementById("map").scrollIntoView(); document.querySelector('[data-flight="${d.id}"]').click();
        const t = performance.now(); const b = document.getElementById("flight-start");
        await new Promise((r) => setTimeout(r, 100));
        while (b.disabled && performance.now() - t < 30000) await new Promise((r) => setTimeout(r, 100));
        return { status: $t("#flight-status"), button: b.textContent, disabled: b.disabled }`);
      check(`flight to ${d.id} ends clean`, state.status.includes("esplorare") && state.button.includes(d.name) && !state.disabled, state);
    }
    await go();
    await send("Network.setBlockedURLs", { urls: ["*elevation-tiles-prod*"] });
    const failed = await js(`document.getElementById("map").scrollIntoView(); document.querySelector('[data-flight="alpe"]').click();
      const t = performance.now(); const b = document.getElementById("flight-start");
      await new Promise((r) => setTimeout(r, 100));
      while ((b.disabled || !$t("#flight-status")) && performance.now() - t < 20000) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1000));
      return { status: $t("#flight-status"), button: b.textContent, disabled: b.disabled }`);
    check("missing terrain says so and offers a retry", failed.status.includes("non arriva") && failed.button === "Riprova il volo" && !failed.disabled, failed);
    await send("Network.setBlockedURLs", { urls: [] });
    const retried = await js(`document.getElementById("flight-start").click();
      const t = performance.now(); const b = document.getElementById("flight-start");
      await new Promise((r) => setTimeout(r, 100));
      while (b.disabled && performance.now() - t < 30000) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 2500));
      return { status: $t("#flight-status"), button: b.textContent }`);
    check("the retry works once terrain is back", retried.status.includes("esplorare") && retried.button.includes("Alpe"), retried);

    await send("Emulation.setEmulatedMedia", { features: [] });
    await go();
    const race = await js(`document.getElementById("map").scrollIntoView(); document.querySelector('[data-flight="alpe"]').click();
      await new Promise((r) => setTimeout(r, 3000)); document.querySelector('[data-flight="cervinia"]').click();
      const t = performance.now(); const b = document.getElementById("flight-start");
      await new Promise((r) => setTimeout(r, 200));
      while (b.disabled && performance.now() - t < 40000) await new Promise((r) => setTimeout(r, 200));
      return { status: $t("#flight-status"), button: b.textContent, disabled: b.disabled, pressed: document.querySelector('[data-flight][aria-pressed="true"]').dataset.flight, ms: Math.round(performance.now() - t) }`);
    check("changing destination mid-flight ends on the new one", race.pressed === "cervinia" && race.button.includes("Cervinia") && !race.disabled, race);

    // The full gate animation, with motion on
    console.error(`[${Math.round(process.uptime())}s] The full gate animation, with motion on: ${passed} ok, ${failures.length} failed`);
    await out();
    await go(`?per=bravo#k=${CODES.bravo}`);
    await js(`await $until(() => document.getElementById("hero-canvas").dataset.painted, 15000);`);
    if (SHOTS) {
      await js(`document.getElementById("gate-submit").click(); await $until(() => document.getElementById("gate-form").classList.contains("is-stamped")); await new Promise((r) => setTimeout(r, 300));`);
      await shot("g04-stamped");
      await sleep(5700);
      await shot("g05-turnstile-opening");
      await sleep(3600);
      await shot("g06-after-the-gate");
      await out();
      await go(`?per=bravo#k=${CODES.bravo}`);
    }
    const opening = await js(`const gate = document.getElementById("gate"); const seen = [];
      document.getElementById("gate-submit").click();
      const t = performance.now();
      let stampedAt = 0; let openedAt = 0; let wish = "";
      while (performance.now() - t < 8500) {
        if (!stampedAt && document.getElementById("gate-form").classList.contains("is-stamped")) { stampedAt = performance.now(); wish = document.getElementById("gate-submit").textContent; }
        if (!openedAt && gate.classList.contains("is-open")) openedAt = performance.now();
        seen.push({ stamped: document.getElementById("gate-form").classList.contains("is-stamped"), open: gate.classList.contains("is-open"), shown: getComputedStyle(gate).display !== "none" });
        await new Promise((r) => setTimeout(r, 60));
      }
      return { stamped: seen.some((s) => s.stamped), opened: seen.some((s) => s.open), gone: !seen[seen.length - 1].shown, locked: document.documentElement.classList.contains("locked"), wish, held: Math.round(openedAt - stampedAt) }`);
    check("the wish stays long enough to read", opening.wish === "Buona discesa" && opening.held >= 4300, opening);
    check("the stamp, then the turnstile, then the page", opening.stamped && opening.opened && opening.gone && !opening.locked, opening);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

    // Layout at each size
    console.error(`[${Math.round(process.uptime())}s] Layout at each size: ${passed} ok, ${failures.length} failed`);
    const sizes = [[320, 568, true], [360, 640, true], [375, 812, true], [414, 896, true], [768, 1024, true], [1440, 900, false]];
    const measure = (selector) => `
      document.querySelectorAll("[data-paint]").forEach((c) => c.style.visibility = "visible");
      const wide = document.documentElement.scrollWidth > innerWidth;
      const out = [...document.querySelectorAll("${selector}")].filter((e) => {
        if (e.closest("svg, .maplibregl-map, .skip, noscript, .prints")) return false;
        const r = e.getBoundingClientRect();
        return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed";
      }).map((e) => e.tagName + (e.id ? "#" + e.id : "." + e.className)).slice(0, 5);
      const small = [...document.querySelectorAll("button, .btn, .sign, .pill, .choice, select, input[type=number], input[type=text], textarea, #bottom-nav a")].filter((e) => {
        if (getComputedStyle(e).visibility === "hidden") return false;
        const r = e.getBoundingClientRect();
        return r.height && r.height < 46;
      }).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height)).slice(0, 5);`;
    for (const [w, h, mobile] of sizes) {
      await size(w, h, mobile);
      await out();
      const gate = JSON.parse(await js(`${measure("#gate, #gate *")}
        const button = document.getElementById("gate-submit").getBoundingClientRect();
        return JSON.stringify({ wide, out, small, buttonBottom: Math.round(button.bottom), height: innerHeight, scrolls: document.getElementById("gate").scrollHeight > innerHeight });`));
      check(`gate fits sideways at ${w}`, !gate.wide && !gate.out.length, gate.out);
      check(`gate targets at least 46px at ${w}`, !gate.small.length, gate.small);
      check(`the stamp button is in the first view at ${w}x${h}`, gate.buttonBottom <= gate.height, gate);
      await js(`await $until(() => document.getElementById("hero-canvas").dataset.painted, 15000);`);
      await shot(`g09-gate-${w}x${h}`);
      await login("alfa");
      const layout = JSON.parse(await js(`${measure("body *")}
        scrollTo(0, 0);
        const post = document.querySelector(".post").getBoundingClientRect();
        return JSON.stringify({ wide, out, small, postBottom: Math.round(post.bottom), height: innerHeight });`));
      check(`no sideways scroll at ${w}`, !layout.wide, layout.out);
      check(`nothing past the edge at ${w}`, !layout.out.length, layout.out);
      check(`targets at least 46px at ${w}`, !layout.small.length, layout.small);
      check(`the vote action is in the first view at ${w}x${h}`, layout.postBottom <= layout.height, layout);
      if (SHOTS && w === 1440) {
        await shot("g18-desktop-hero");
        await js(`document.getElementById("house-form").scrollIntoView(); scrollBy(0, -110);`);
        await settle();
        await shot("g19-desktop-houses");
      }
    }
    if (SHOTS) {
      await size(1200, 630, false);
      await send("Emulation.setScrollbarsHidden", { hidden: true });
      await out();
      await js(`await $until(() => document.getElementById("hero-canvas").dataset.painted, 15000);`);
      await shot("og-gate");
      await send("Emulation.setScrollbarsHidden", { hidden: false });
    }
    await size(375, 812);

    // Offline, with the server really gone
    console.error(`[${Math.round(process.uptime())}s] Offline, with the server really gone: ${passed} ok, ${failures.length} failed`);
    await login("bravo");
    await js(`document.getElementById("quote-note").value = "per la strada"; document.getElementById("quote-form").requestSubmit(); await $until(() => document.querySelector("#quote-list li"));`);
    const ready = await js(`await navigator.serviceWorker.ready; await new Promise((r) => setTimeout(r, 2500));
      const keys = await caches.keys(); const c = await caches.open(keys[0]); return { keys, files: (await c.keys()).length, withCode: (await c.keys()).filter((r) => r.url.includes("#")).length }`);
    check("the offline copy is stored", ready.files >= 40, ready);
    check("no code stays in the offline copy", ready.withCode === 0, ready);
    check("no failed requests while online", !badResponses.length, badResponses.slice(0, 6));
    server.close();
    server.closeAllConnections();
    await sleep(500);
    await send("Page.reload");
    await sleep(5000);
    const offline = await js(`const c = document.getElementById("hero-canvas"); const t = performance.now(); while (!c.dataset.painted && performance.now() - t < 15000) await new Promise((r) => setTimeout(r, 50));
      document.querySelector('[data-map="thorens"]').click(); await new Promise((r) => setTimeout(r, 600));
      const plate = document.querySelector('[data-paint="thorens"]'); plate.scrollIntoView();
      const p = performance.now(); while (!plate.dataset.painted && performance.now() - p < 15000) await new Promise((r) => setTimeout(r, 50));
      await document.fonts.ready;
      const faces = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
      document.getElementById("photos").scrollIntoView({ block: "center" });
      await $until(() => !document.getElementById("photos-note").hidden, 4000);
      return { photoNote: !document.getElementById("photos-note").hidden, title: $t("h1"), locked: document.documentElement.classList.contains("locked"), painted: c.dataset.painted, plate: plate.dataset.painted, synthetic: !!document.querySelector(".plate-note"), quotes: document.querySelectorAll("#quote-list li").length, note: $t("#quotes-note"), piste: $t("#piste-status"), font: faces.includes("Barlow") && faces.includes("Bowlby One") }`);
    check("the page opens with no server", offline.title?.startsWith("Quattro") && offline.painted === "true" && !offline.locked, offline);
    check("real terrain offline", offline.plate === "true" && !offline.synthetic, offline);
    check("saved data offline, and it says so", offline.quotes === 1 && offline.note?.includes("Non riesco ad aggiornare"), offline);
    check("piste map offline", offline.piste?.includes("Val Thorens"), offline);
    check("photos offline say they need the network", offline.photoNote, offline);
    check("fonts offline", offline.font, offline);

    check("no uncaught errors", !exceptions.length, exceptions.slice(0, 6));
    ws.close();
  } finally {
    server.close();
    server.closeAllConnections();
    edge.kill();
    await db.close();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* the browser may still hold it */ }
  }
  console.log(`${passed} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`FAIL ${f}`));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
