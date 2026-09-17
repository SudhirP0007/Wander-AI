// FR-05: hotel price comparison.
// Amadeus's free self-service tier was discontinued (July 2026), so this
// always returns realistic mock data sorted by price, lowest first.
function seededPrice(seed, min, max) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return min + (h % (max - min));
}
function mockHotels(destination) {
  const names = [
    `${destination} Central Hotel`,
    `Grand ${destination} Suites`,
    `${destination} Boutique Stay`,
    `${destination} Budget Inn`,
    `${destination} Riverside Lodge`,
    `${destination} Backpacker Hostel`,
  ];
  const hotels = names.map((name, i) => ({
    name,
    star_rating: Math.max(1, 5 - Math.floor(i / 1.5)),
    guest_rating: Math.max(6.5, 9.2 - i * 0.4).toFixed(1),
    price_per_night: seededPrice(name, 40, 420),
    currency: 'AUD',
    breakfast_included: i % 2 === 0,
  }));
  return hotels.sort((a, b) => a.price_per_night - b.price_per_night);
}
async function getHotelOffers(destination) {
  return mockHotels(destination);
}
module.exports = { getHotelOffers };