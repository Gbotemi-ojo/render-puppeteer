const puppeteer = require("puppeteer");
require("dotenv").config();

const scrapeLogic = async (res) => {
  const browser = await puppeteer.launch({
    args: [
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
    ],
    executablePath:
      process.env.NODE_ENV === "production"
        ? process.env.PUPPETEER_EXECUTABLE_PATH
        : puppeteer.executablePath(),
  });
  try {
    const page = await browser.newPage();

    // 1. GO TO THE TEST WEBSITE
    await page.goto("https://quotes.toscrape.com/");

    // Set screen size (optional, but good practice)
    await page.setViewport({ width: 1080, height: 1024 });

    // 2. DEFINE A STABLE SELECTOR
    // We want the text (class="text") inside the first quote container (class="quote")
    const selector = ".quote .text";

    // 3. WAIT FOR THE ELEMENT
    await page.waitForSelector(selector);

    // 4. EXTRACT THE TEXT
    // page.$eval finds the *first* element matching the selector and runs the function on it
    const firstQuote = await page.$eval(selector, (el) => el.textContent);

    // 5. SEND THE RESULT
    const logStatement = `Found quote: ${firstQuote}`;
    console.log(logStatement);
    res.send(logStatement);

  } catch (e) {
    console.error(e);
    res.send(`Something went wrong while running Puppeteer: ${e}`);
  } finally {
    await browser.close();
  }
};

module.exports = { scrapeLogic };
