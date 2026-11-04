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
const [thorens, tignes, alpe, serre] = ["thorens", "tignes", "alpe", "serre"].map(place);
const others = (d) => TRIP.destinations.filter((x) => x !== d);

assert.ok(others(thorens).every((d) => thorens.pass[4] > d.pass[4]), 'review: legend "la nera ha lo skipass più caro" and the Val Thorens downside');
assert.ok(others(tignes).every((d) => tignes.trip.km > d.trip.km), 'review: legend "la rossa il tragitto più lungo" and the Tignes downside');
assert.ok(others(alpe).every((d) => alpe.pass[4] < d.pass[4]), 'review: legend "la blu lo skipass meno caro" and the Alpe title');
assert.ok(others(serre).every((d) => serre.trip.km < d.trip.km), 'review: legend "la verde il tragitto più corto" and the Serre title');
assert.ok(others(serre).every((d) => serre.top < d.top), 'review: Serre "la quota massima più bassa"');
assert.ok(others(thorens).every((d) => thorens.km > d.km), 'review: Val Thorens "il comprensorio più grande delle quattro"');
assert.ok(others(serre).every((d) => serre.ratings.apres < d.ratings.apres), 'review: Serre "il più tranquillo delle quattro"');
assert.ok(others(thorens).every((d) => thorens.ratings.apres > d.ratings.apres), 'review: Val Thorens title "la festa più forte"');
assert.strictEqual(TRIP.destinations.map((d) => d.grade).join(), "black,red,blue,green", "review: destinations run from the black down");
assert.strictEqual(TRIP.destinations.length, 4, 'review: "quattro" in index.html and the objection');
assert.strictEqual(tignes.drive, "circa 4 h", 'review: Tignes downside "circa 4 h"');
assert.strictEqual(alpe.drive, "circa 3 h 30", 'review: Alpe downside "circa 3 h 30"');
assert.strictEqual(thorens.trip.tolls, tignes.trip.tolls, 'review: Tignes "gli stessi pedaggi di Val Thorens"');
for (const d of [thorens, tignes]) assert.ok(d.downside.includes(`circa ${d.trip.tolls} €`), `review: ${d.id} downside states its tolls`);
const euros = (note) => [...note.matchAll(/(\d+(?:,\d+)?) €/g)].map((m) => Number(m[1].replace(",", ".")));
for (const d of [thorens, tignes]) assert.strictEqual(Math.round(euros(d.trip.tollsNote).reduce((a, b) => a + b)), d.trip.tolls, `review: ${d.id} tolls note against its total`);
for (const d of [alpe, serre]) assert.strictEqual(euros(d.trip.tollsNote)[0] * 2, d.trip.tolls, `review: ${d.id} tolls note against its total`);
assert.strictEqual(new Date(Date.UTC(2027, 1, 4)).getUTCDay(), 4, 'review: "Dal 4 al 7 febbraio è da giovedì a domenica"');
assert.strictEqual(new Date(Date.UTC(2027, 1, 7)).getUTCDay(), 0, 'review: "Dal 4 al 7 febbraio è da giovedì a domenica"');
// The owner's choice of venues.
const venues = { thorens: ["La Folie Douce", "Saloon Bar"], tignes: ["Cocorico", "Grizzly's Bar"], alpe: ["La Folie Douce", "Moose Bar"], serre: ["Le Chazelay", "Off Piste", "La Grotte"] };
for (const d of TRIP.destinations) {
  assert.strictEqual(d.apres.venues.map((v) => v.name).join(), venues[d.id].join(), `review: ${d.id} venues`);
  assert.ok(d.apres.venues.every((v) => v.url.startsWith("https://")), `review: ${d.id} venue links`);
}
assert.strictEqual(TRIP.defaults.days - 1, TRIP.defaults.shared.nights, "review: 3 notti e 4 giorni di sci");

console.log("budget ok");
