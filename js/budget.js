// Per-person quote. Apartment and cars are split across the group.
// Each line is in whole euros and the totals are made of those lines, so every figure on screen adds up.
globalThis.tripCost = function tripCost({ days, pass, flatTotal, km, consumption, fuelPrice, tolls, foodPerDay, extras, people, cars }) {
  const fuelPerCar = (km / 100) * consumption * fuelPrice;
  const lines = {
    pass: Math.round(pass),
    lodging: Math.round(flatTotal / people),
    fuel: Math.round((fuelPerCar * cars) / people),
    tolls: Math.round((tolls * cars) / people),
    food: Math.round(foodPerDay * days),
    extras: Math.round(extras),
  };
  const total = Object.values(lines).reduce((sum, value) => sum + value, 0);
  return { ...lines, total, groupTotal: total * people };
};

// A lodging's price, brought to another length of stay at the same rate.
globalThis.houseTotal = function houseTotal(house, nights) {
  return (house.total / house.nights) * nights;
};
