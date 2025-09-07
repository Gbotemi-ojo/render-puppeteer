const puppeteer = require("puppeteer");
// const cheerio = require("cheerio"); // <-- Removed Cheerio dependency

/**
 * Scrapes a single player's profile, clicks "Load more" repeatedly,
 * and returns the player's name and all opponents found.
 * @param {string} playerID The ID of the player to scrape.
 * @returns {Promise<{playerName: string, opponents: Array<{id: string, name: string}>}>}
 */
const scrapeLogic = async (playerID) => {
  let browser = null;
  console.log(`[SCRAPER] Launching browser for player: ${playerID}`);

  try {
    browser = await puppeteer.launch({
      headless: true,
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

    const page = await browser.newPage();
    const url = `https://tracker.ftgames.com/?id=${playerID}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

    // Loop to click "Load more" until it's no longer available
    for (let i = 0; i < 400; i++) { // Safety break after 400 clicks
      try {
        const loadMoreButtonXPath = "//button[contains(text(), 'Load more')]";
        const buttonHandle = await page.waitForSelector('xpath/' + loadMoreButtonXPath, { timeout: 3000 });

        if (buttonHandle) {
          await buttonHandle.click();
          // Wait for the loading spinner to disappear
          await page.waitForSelector('svg.animate-spin', { hidden: true, timeout: 15000 });
          // Add a small artificial delay to ensure content loads
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          break; // Exit loop if button is not found
        }
      } catch {
        console.log(`[SCRAPER] No more 'Load more' buttons for player ${playerID}.`);
        break; // Exit loop on timeout or other errors
      }
    }

    // --- REPLACEMENT LOGIC ---
    // Instead of exporting HTML to Cheerio, we use page.evaluate() 
    // to run logic directly in the browser's DOM.

    const extractedData = await page.evaluate(() => {
      // This code runs inside the browser context (it can use document.querySelector)
      const nameEl = document.querySelector('header > span.font-HEAD');
      const playerName = nameEl ? nameEl.textContent.trim() : '';

      const opponents = [];
      const processedOpponentIds = new Set();
      
      // Select all opponent anchor tags
      const opponentLinks = document.querySelectorAll('a.col-span-2');

      opponentLinks.forEach((el) => {
        const href = el.getAttribute('href');
        const id = href ? href.split('=')[1] : null;
        
        // Find the <p> tag within the link for the name
        const nameEl = el.querySelector('p');
        const name = nameEl ? nameEl.textContent.trim() : '';

        if (id && name && !processedOpponentIds.has(id)) {
          opponents.push({ id, name });
          processedOpponentIds.add(id);
        }
      });

      return { playerName, opponents };
    });

    console.log(`[SCRAPER] Scraped ${extractedData.opponents.length} opponents for player "${extractedData.playerName}".`);
    return extractedData; // Return the data object directly from page.evaluate()

  } finally {
    if (browser) {
      await browser.close();
      console.log(`[SCRAPER] Closed browser for player: ${playerID}`);
    }
  }
};

module.exports = { scrapeLogic };
