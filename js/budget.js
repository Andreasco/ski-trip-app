// Per-person quote. Apartment and cars are split across the group.
globalThis.tripCost = function tripCost({ days, pass, flatTotal, km, consumption, fuelPrice, tolls, foodPerDay, extras, people, cars }) {
  const fuelPerCar = (km / 100) * consumption * fuelPrice;
  const lodging = flatTotal / people;
  const fuel = (fuelPerCar * cars) / people;
  const tollShare = (tolls * cars) / people;
  const food = foodPerDay * days;
  const total = pass + lodging + fuel + tollShare + food + extras;
  return { pass, lodging, fuel, tolls: tollShare, food, extras, total, groupTotal: total * people };
};

// Weekly rentals cost the same however many days we ski; the rest are priced per night.
globalThis.defaultFlatTotal = function defaultFlatTotal(dest, days) {
  return dest.flat.total ?? dest.flat.nightly * days;
};
