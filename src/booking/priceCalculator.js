// Booking price calculator for the Session 5 exercises.
// Business rules: demo-scenarios/session-4-restful-booker/1_Broneeringu_nouded_mustand.md
// All money values are in cents. Dates are 'YYYY-MM-DD' strings and are handled in UTC.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const WEEKEND_SURCHARGE = 1.2;
const MAX_NIGHTS = 14;
const MAX_NIGHTS_REGULAR = 30;

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date: ${value}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function countNights(checkin, checkout) {
  return Math.round((parseDate(checkout) - parseDate(checkin)) / MS_PER_DAY);
}

function validateStay(nights, options = {}) {
  const maxNights = options.regular ? MAX_NIGHTS_REGULAR : MAX_NIGHTS;
  if (nights > maxNights) {
    throw new Error(`Stay too long: ${nights} nights (max ${maxNights})`);
  }
}

// Night `index` of a stay starting at `start`: Friday and Saturday nights are weekend nights.
function nightPrice(start, index, nightlyRateCents) {
  const date = new Date(start.getTime() + index * MS_PER_DAY);
  const day = date.getUTCDay();
  const weekend = day === 5 || day === 6;
  return {
    date,
    weekend,
    priceCents: weekend ? Math.round(nightlyRateCents * WEEKEND_SURCHARGE) : nightlyRateCents
  };
}

function calculatePrice(booking) {
  const { nightlyRateCents, checkin, checkout, discountPercent = 0, isRegular = false } = booking;
  const nights = countNights(checkin, checkout);
  validateStay(nights, booking);

  const start = parseDate(checkin);
  let subtotal = nights * nightlyRateCents;
  let weekendNights = 0;
  for (let i = 0; i < nights; i += 1) {
    const { weekend, priceCents } = nightPrice(start, i, nightlyRateCents);
    if (weekend) {
      subtotal += priceCents - nightlyRateCents;
      weekendNights += 1;
    }
  }

  const discount = Math.min(Math.max(discountPercent, 0), 100);
  const totalCents = Math.round(subtotal * (1 - discount / 100));

  return {
    nights,
    weekendNights,
    subtotalCents: subtotal,
    totalCents,
    depositRequired: !isRegular && nights >= 7
  };
}

function quoteNightly(booking) {
  const { nightlyRateCents, checkin, checkout } = booking;
  const nights = countNights(checkin, checkout);
  const start = parseDate(checkin);
  const lines = [];
  for (let i = 0; i < nights; i += 1) {
    const { date, weekend, priceCents } = nightPrice(start, i, nightlyRateCents);
    lines.push({ date: date.toISOString().slice(0, 10), weekend, priceCents });
  }
  return lines;
}

function cancellationFee({ totalCents, checkinAt, cancelledAt = Date.now() }) {
  const hoursBefore = (checkinAt - cancelledAt) / MS_PER_HOUR;
  if (hoursBefore >= 48) {
    return 0;
  }
  return Math.round(totalCents * 0.5);
}

module.exports = {
  calculatePrice,
  quoteNightly,
  cancellationFee,
  countNights,
  MAX_NIGHTS,
  MAX_NIGHTS_REGULAR
};
