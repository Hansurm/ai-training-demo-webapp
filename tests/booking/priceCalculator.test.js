const { calculatePrice } = require('../../src/booking/priceCalculator');

// Expected results come from demo-scenarios/session-4-restful-booker/1_Broneeringu_nouded_mustand.md,
// not from the code. Test names start with the requirement number.
describe('priceCalculator', () => {
  const nightlyRateCents = 10000;
  const monday = '2027-01-04'; // 2027-01-04 is a Monday (UTC); Fri = 01-08, Sat = 01-09, Sun = 01-10.

  // Stay of `nights` nights starting on `checkin` (UTC, YYYY-MM-DD).
  function stay(nights, checkin = monday) {
    const checkout = new Date(`${checkin}T00:00:00Z`);
    checkout.setUTCDate(checkout.getUTCDate() + nights);
    return { nightlyRateCents, checkin, checkout: checkout.toISOString().slice(0, 10) };
  }

  // KÜSIMUS: nõuded ei ütle, kuidas süsteem keelatud broneeringu tagasi lükkab (viga, veateade,
  // tagastusväärtus?). Testid eeldavad, et calculatePrice viskab vea.

  test('2.1 calculatePrice rejects checkout before checkin', () => {
    expect(() => calculatePrice({ nightlyRateCents, checkin: '2027-01-06', checkout: '2027-01-04' })).toThrow();
  });

  test('2.2 calculatePrice rejects 0 nights (below minimum)', () => {
    expect(() => calculatePrice(stay(0))).toThrow();
  });

  test.each([1, 2])('2.2 calculatePrice accepts %i nights (at and above minimum)', (nights) => {
    expect(calculatePrice(stay(nights)).nights).toBe(nights);
  });

  test.each([13, 14])('2.2 calculatePrice accepts %i nights (below and at maximum)', (nights) => {
    expect(calculatePrice(stay(nights)).nights).toBe(nights);
  });

  test('2.2 calculatePrice rejects 15 nights (above maximum)', () => {
    expect(() => calculatePrice(stay(15))).toThrow();
  });

  test('3.1 calculatePrice total is nightly rate times nights for weekday nights', () => {
    // Mon, Tue, Wed nights: no weekend surcharge (3.2).
    expect(calculatePrice(stay(3)).totalCents).toBe(30000);
  });

  // KÜSIMUS: kuidas ümardada 20% juurdehindlust, kui ööhind sentides ei jagu (nt 9999 × 1,2 = 11998,8)?
  // Testid kasutavad ööhinda, kus ümardamist pole vaja.
  test('3.2 calculatePrice charges Friday and Saturday nights 20% more', () => {
    // Thu, Fri, Sat nights: 10000 + 12000 + 12000.
    expect(calculatePrice(stay(3, '2027-01-07')).totalCents).toBe(34000);
  });

  test('3.2 calculatePrice does not charge Sunday or Thursday nights extra', () => {
    expect(calculatePrice(stay(1, '2027-01-10')).totalCents).toBe(10000);
    expect(calculatePrice(stay(1, '2027-01-07')).totalCents).toBe(10000);
  });

  test('3.4 calculatePrice rejects a negative nightly rate', () => {
    // KÜSIMUS: kas negatiivne hind tuleb tagasi lükata või asendada nulliga? Test eeldab tagasilükkamist.
    expect(() => calculatePrice({ ...stay(1), nightlyRateCents: -100 })).toThrow();
  });

  test('3.4 calculatePrice applies a 0.1% discount', () => {
    expect(calculatePrice({ ...stay(1), discountPercent: 0.1 }).totalCents).toBe(9990);
  });

  test('3.4 calculatePrice allows a 100% discount and the total is 0', () => {
    expect(calculatePrice({ ...stay(1), discountPercent: 100 }).totalCents).toBe(0);
  });

  test('3.4 calculatePrice total is not negative with a discount above 100%', () => {
    // KÜSIMUS: "Allahindlus kuni 100%" — kas 100,1% tuleb tagasi lükata või piirata 100%-ga?
    // Nõudest tuleneb kindlalt ainult see, et hind ei ole negatiivne.
    // KÜSIMUS: kas negatiivne allahindlus (-1%, s.t juurdehindlus) on lubatud? Nõue ei ütle.
    expect(calculatePrice({ ...stay(1), discountPercent: 100.1 }).totalCents).toBeGreaterThanOrEqual(0);
  });

  // KÜSIMUS: "üle nädala" — kas 7 ööd on "üle nädala"? Testid tõlgendavad: üle 7 öö, s.t 8+ ööd.
  // Nõude märkmed räägivad päevadest ("6 päeva, 7 päeva, 8"), arvutus öödest — kumba mõeldakse?
  test('4.1 calculatePrice does not require a deposit for 6 nights (below a week)', () => {
    expect(calculatePrice(stay(6)).depositRequired).toBe(false);
  });

  test('4.1 calculatePrice does not require a deposit for 7 nights (exactly a week)', () => {
    expect(calculatePrice(stay(7)).depositRequired).toBe(false);
  });

  test('4.1 calculatePrice requires a deposit for 8 nights (over a week)', () => {
    expect(calculatePrice(stay(8)).depositRequired).toBe(true);
  });

  test('4.2 calculatePrice does not require a deposit from a regular customer for 8 nights', () => {
    expect(calculatePrice({ ...stay(8), isRegular: true }).depositRequired).toBe(false);
  });

  // KÜSIMUS: kas 7.1 kehtib ainult maksimumi kohta ja miinimum 1 öö (2.2) jääb püsikliendile samaks?
  test.each([29, 30])('7.1 calculatePrice accepts %i nights for a regular customer (below and at maximum)', (nights) => {
    expect(calculatePrice({ ...stay(nights), isRegular: true }).nights).toBe(nights);
  });

  test('7.1 calculatePrice rejects 31 nights for a regular customer (above maximum)', () => {
    expect(() => calculatePrice({ ...stay(31), isRegular: true })).toThrow();
  });
});
