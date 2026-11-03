// Run with: node tests/budget.test.js
const assert = require("node:assert");
require("../js/budget.js");
require("../js/data.js");

const base = {
  days: 4,
  pass: 243,
  flatTotal: 1342,
  km: 380,
  consumption: 7,
  fuelPrice: 2,
  tolls: 26,
  foodPerDay: 35,
  extras: 10,
  people: 4,
  cars: 1,
};

const one = globalThis.tripCost(base);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} is not ${expected}`);

close(one.lodging, 335.5);
close(one.fuel, 13.3);
close(one.tolls, 6.5);
close(one.food, 140);
close(one.total, 748.3);
close(one.groupTotal, 2993.2);

const twoCars = globalThis.tripCost({ ...base, cars: 2 });
close(twoCars.fuel, 26.6);
close(twoCars.tolls, 13);

const three = globalThis.tripCost({ ...base, people: 3 });
close(three.lodging, 1342 / 3);

assert.strictEqual(globalThis.defaultFlatTotal({ flat: { total: 1342 } }, 4), 1342);
assert.strictEqual(globalThis.defaultFlatTotal({ flat: { total: 1342 } }, 5), 1342);
assert.strictEqual(globalThis.defaultFlatTotal({ flat: { nightly: 210 } }, 5), 1050);

// Sentences in js/data.js and index.html that state these facts: a failure means "review this sentence".
const { TRIP, defaultFlatTotal } = globalThis;
const place = (id) => TRIP.destinations.find((d) => d.id === id);
const totalOf = (d, days, over = {}) => globalThis.tripCost({ ...TRIP.defaults.shared, days, km: d.trip.km, tolls: d.trip.tolls, pass: d.pass[days], flatTotal: defaultFlatTotal(d, days), ...over }).total;
const weekOf = (d) => totalOf(d, 4, { flatTotal: d.flat.total ?? d.flat.nightly * 7 });
const fs = require("node:fs");
const privatePath = require("node:path").join(__dirname, "..", "private", "content.json");
// The group's budget stays private: without that file, the claims that depend on it are skipped.
const high = fs.existsSync(privatePath) ? Math.max(...JSON.parse(fs.readFileSync(privatePath, "utf8")).pastTrips.map((t) => t.cost)) : -Infinity;
const [alpe, thorens, cervinia] = ["alpe", "thorens", "cervinia"].map(place);

assert.ok(totalOf(alpe, 4) > high, 'review: Alpe "sfora il budget già con 4 giorni"');
assert.ok(weekOf(thorens) > high, 'review: Val Thorens "A settimana intera sfora il budget"');
assert.ok(weekOf(cervinia) > weekOf(alpe) && weekOf(cervinia) > weekOf(thorens), 'review: Cervinia "il vantaggio sul conto sparisce"');
assert.ok(thorens.trip.tolls > alpe.trip.tolls && thorens.trip.tolls > cervinia.trip.tolls, 'review: legend "la nera ha i pedaggi più cari"');
assert.ok(cervinia.trip.km < alpe.trip.km && cervinia.trip.km < thorens.trip.km, 'review: legend "la blu è la più vicina"');
close(cervinia.passOption.prices[4] - cervinia.pass[4], 88.5); // Cervinia pitch: "per 88,50 € in più con 4 giorni"
const euros = (note) => [...note.matchAll(/(\d+(?:,\d+)?) €/g)].map((m) => Number(m[1].replace(",", ".")));
const thorensTolls = euros(thorens.trip.tollsNote);
assert.strictEqual(Math.round(thorensTolls.reduce((a, b) => a + b)), thorens.trip.tolls, "review: Val Thorens tolls note against its total");
assert.strictEqual(Math.round(thorensTolls[0]), 70, 'review: Val Thorens "il Fréjus aggiunge circa 70 €"');
assert.ok(thorens.downside.includes("circa 70 €"), 'review: Val Thorens "il Fréjus aggiunge circa 70 €"');
assert.strictEqual(euros(alpe.trip.tollsNote)[0] * 2, alpe.trip.tolls, "review: Alpe tolls note against its total");
assert.strictEqual(Math.round(euros(cervinia.trip.tollsNote)[0] * 2), cervinia.trip.tolls, "review: Cervinia tolls note against its total");
assert.strictEqual(new Date(Date.UTC(2027, 1, 27)).getUTCDay(), 6, 'review: "Arrivando il 27 febbraio" as a Saturday');
assert.ok(thorens.flat.total && !thorens.flat.note.includes("inclus"), "review: TRIP.taxNote");

console.log("budget ok");
