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

// A lodging's price, brought to another length of stay at the same rate.
globalThis.houseTotal = function houseTotal(house, nights) {
  return (house.total / house.nights) * nights;
};
