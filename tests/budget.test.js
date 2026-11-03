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

close(globalThis.houseTotal({ total: 600, nights: 3 }, 3), 600);
close(globalThis.houseTotal({ total: 600, nights: 3 }, 4), 800);

// Sentences in js/data.js and index.html that state these facts: a failure means "review this sentence".
const { TRIP } = globalThis;
const place = (id) => TRIP.destinations.find((d) => d.id === id);
const [alpe, thorens, serre, cervinia] = ["alpe", "thorens", "serre", "cervinia"].map(place);
const others = (d) => TRIP.destinations.filter((x) => x !== d);

assert.ok(others(thorens).every((d) => thorens.trip.tolls > d.trip.tolls), 'review: legend "la nera ha i pedaggi più cari"');
assert.ok(others(alpe).every((d) => alpe.trip.km > d.trip.km), 'review: legend "la rossa il tragitto più lungo" and the Alpe downside');
assert.strictEqual(serre.drive, "circa 2 h", 'review: legend "blu e verde stanno a circa 2 ore"');
assert.strictEqual(cervinia.drive, "circa 2 h", 'review: legend "blu e verde stanno a circa 2 ore"');
assert.ok(others(serre).every((d) => serre.top < d.top), 'review: Serre "la quota massima più bassa"');
assert.strictEqual(TRIP.destinations.map((d) => d.grade).join(), "black,red,blue,green", "review: destinations run from the black down");
assert.strictEqual(TRIP.destinations.length, 4, 'review: "quattro" in index.html and the objection');
assert.ok(thorens.title.includes(`${thorens.km} km`) && thorens.kmNote.includes("600"), 'review: Val Thorens title "150 km che diventano 600"');
close(cervinia.passOption.prices[4] - cervinia.pass[4], 88.5); // Cervinia pitch: "per 88,50 € in più con 4 giorni"
const euros = (note) => [...note.matchAll(/(\d+(?:,\d+)?) €/g)].map((m) => Number(m[1].replace(",", ".")));
const thorensTolls = euros(thorens.trip.tollsNote);
assert.strictEqual(Math.round(thorensTolls.reduce((a, b) => a + b)), thorens.trip.tolls, "review: Val Thorens tolls note against its total");
assert.strictEqual(Math.round(thorensTolls[0]), 70, 'review: Val Thorens "il Fréjus aggiunge circa 70 €"');
assert.ok(thorens.downside.includes("circa 70 €"), 'review: Val Thorens "il Fréjus aggiunge circa 70 €"');
assert.strictEqual(euros(alpe.trip.tollsNote)[0] * 2, alpe.trip.tolls, "review: Alpe tolls note against its total");
assert.strictEqual(euros(serre.trip.tollsNote)[0] * 2, serre.trip.tolls, "review: Serre tolls note against its total");
assert.strictEqual(Math.round(euros(cervinia.trip.tollsNote)[0] * 2), cervinia.trip.tolls, "review: Cervinia tolls note against its total");
assert.strictEqual(new Date(Date.UTC(2027, 1, 18)).getUTCDay(), 4, 'review: "Dal 18 al 21 febbraio è da giovedì a domenica"');
assert.strictEqual(new Date(Date.UTC(2027, 1, 21)).getUTCDay(), 0, 'review: "Dal 18 al 21 febbraio è da giovedì a domenica"');
assert.strictEqual(TRIP.defaults.days - 1, TRIP.defaults.shared.nights, "review: 3 notti e 4 giorni di sci");

console.log("budget ok");
