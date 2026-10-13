const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

// Scenarios: demo-scenarios/session-4-restful-booker/7_Brauseri_stsenaariumid.md
const BASE_URL = 'https://automationintesting.online';
const TIMEOUT_MS = 15000;

function createDriver() {
  const options = new chrome.Options().addArguments('--headless=new', '--window-size=1280,900');
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Random 2-night stay 90..179 days ahead. Check-in is Sun..Thu so all three
// calendar cells (check-in, night 2, check-out) sit in one week row.
function randomStay(today = new Date()) {
  let checkin;
  do {
    checkin = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    checkin.setUTCDate(checkin.getUTCDate() + 90 + Math.floor(Math.random() * 90));
  } while (checkin.getUTCDay() > 4);
  const checkout = new Date(checkin);
  checkout.setUTCDate(checkout.getUTCDate() + 2);
  return { checkin, checkout };
}

async function click(driver, element) {
  await driver.executeScript('arguments[0].scrollIntoView({ block: "center", behavior: "instant" })', element);
  await driver.wait(until.elementIsVisible(element), TIMEOUT_MS);
  await element.click();
}

async function clickButton(driver, text) {
  const button = await driver.wait(until.elementLocated(By.xpath(`//button[normalize-space()='${text}']`)), TIMEOUT_MS);
  await click(driver, button);
}

async function selectStayInCalendar(driver, { checkin, checkout }) {
  const label = checkin.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  await driver.wait(until.elementLocated(By.css('.rbc-calendar')), TIMEOUT_MS);
  for (let i = 0; i < 12 && (await driver.findElement(By.css('.rbc-toolbar-label')).getText()) !== label; i++) {
    await clickButton(driver, 'Next');
  }
  expect(await driver.findElement(By.css('.rbc-toolbar-label')).getText()).toBe(label);

  // Month grid starts on the Sunday on or before the 1st.
  const firstWeekday = new Date(Date.UTC(checkin.getUTCFullYear(), checkin.getUTCMonth(), 1)).getUTCDay();
  const startIndex = firstWeekday + checkin.getUTCDate() - 1;
  const dayCells = await driver.findElements(By.css('.rbc-day-bg'));
  await driver.executeScript('arguments[0].scrollIntoView({ block: "center", behavior: "instant" })', dayCells[startIndex]);
  const nights = (checkout - checkin) / 86400000;
  let drag = driver.actions().move({ origin: dayCells[startIndex] }).press();
  for (let i = 1; i <= nights; i++) drag = drag.move({ origin: dayCells[startIndex + i] });
  await drag.release().perform();
}

async function openReservationForm(driver, stay) {
  await driver.get(BASE_URL);
  const bookNow = await driver.wait(until.elementLocated(By.xpath("//a[normalize-space()='Book now']")), TIMEOUT_MS);
  await click(driver, bookNow);
  await driver.wait(until.urlContains('/reservation/'), TIMEOUT_MS);
  await selectStayInCalendar(driver, stay);
  await clickButton(driver, 'Reserve Now');
  await driver.wait(until.elementLocated(By.name('firstname')), TIMEOUT_MS);
}

async function fillForm(driver, fields) {
  for (const [name, value] of Object.entries(fields)) {
    const input = await driver.findElement(By.name(name));
    await driver.executeScript('arguments[0].scrollIntoView({ block: "center", behavior: "instant" })', input);
    await input.sendKeys(value);
  }
}

// Waits until the booking panel shows a result: confirmation, an error alert or a crash page.
async function waitForBookingResult(driver) {
  const result = By.xpath("//h2[normalize-space()='Booking Confirmed'] | //*[contains(@class,'alert')][normalize-space()] | //h1[contains(.,'couldn')]");
  await driver.wait(until.elementLocated(result), TIMEOUT_MS).catch(() => {});
  return driver.findElement(By.css('body')).getText();
}

describe('reservation page', () => {
  const guest = { firstname: 'Test', lastname: 'Koolitus', email: 'test@example.com', phone: '+37255500000' };

  test('S1 booking with valid data shows Booking Confirmed and the selected dates', async () => {
    const driver = await createDriver();
    try {
      const stay = randomStay();
      await openReservationForm(driver, stay);
      await fillForm(driver, guest);
      await clickButton(driver, 'Reserve Now');

      const pageText = await waitForBookingResult(driver);

      expect(pageText).toContain('Booking Confirmed');
      expect(pageText).toContain(isoDate(stay.checkin));
      expect(pageText).toContain(isoDate(stay.checkout));
    } finally {
      await driver.quit();
    }
  }, 90000);

  test('S2 booking with empty Firstname is not confirmed and the error names the field', async () => {
    const driver = await createDriver();
    try {
      await openReservationForm(driver, randomStay());
      const { firstname, ...withoutFirstname } = guest;
      await fillForm(driver, withoutFirstname);
      await clickButton(driver, 'Reserve Now');

      const pageText = await waitForBookingResult(driver);

      expect(pageText).not.toContain('Booking Confirmed');
      const alerts = await driver.findElements(By.xpath("//*[contains(@class,'alert')][normalize-space()]"));
      const alertText = (await Promise.all(alerts.map((alert) => alert.getText()))).join('\n');
      expect(alertText).toMatch(/first\s?name/i);
    } finally {
      await driver.quit();
    }
  }, 90000);

  test('S3 checkout before checkin shows no negative nights or price in the price summary', async () => {
    const driver = await createDriver();
    try {
      // Scenario swaps the dates: checkout is 2 days before checkin.
      const { checkin, checkout } = randomStay();
      await driver.get(`${BASE_URL}/reservation/1?checkin=${isoDate(checkout)}&checkout=${isoDate(checkin)}`);
      const summary = await driver.wait(until.elementLocated(By.xpath("//h3[normalize-space()='Price Summary']/..")), TIMEOUT_MS);
      await driver.executeScript('arguments[0].scrollIntoView({ block: "center", behavior: "instant" })', summary);

      const summaryText = await summary.getText();

      expect(summaryText).not.toMatch(/-\s*£?\d/);
    } finally {
      await driver.quit();
    }
  }, 90000);
});
