// Use puppeteer-extra to add the stealth plugin
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
// Import the core puppeteer library to dynamically find the correct browser path
const puppeteerCore = require('puppeteer');

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
    // --- NEW FIX: Explicitly set the executablePath using the core library's helper ---
    // This removes any ambiguity about where the browser is located inside the Docker container.
    const executablePath = puppeteerCore.executablePath();

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      executablePath: executablePath, // Use the dynamically found path
    });

    const page = await browser.newPage();
    const url = `https://tracker.ftgames.com/?id=${playerID}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

    // Wait for the main player name to appear before doing anything else.
    // This is a crucial check to ensure the page is loaded correctly.
    try {
        await page.waitForSelector('header > span.font-HEAD', { timeout: 25000 });
    } catch (e) {
        throw new Error("Could not find player name element. The page might have changed or is blocking the scrape.");
    }
    
    // Loop to click "Load more" until it's no longer available
    for (let i = 0; i < 400; i++) { // Safety break after 400 clicks
      try {
        const loadMoreButtonXPath = "//button[contains(text(), 'Load more')]";
        const buttonHandle = await page.waitForSelector('xpath/' + loadMoreButtonXPath, { timeout: 3000 });

        if (buttonHandle) {
          await buttonHandle.click();
          await page.waitForSelector('svg.animate-spin', { hidden: true, timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          break; 
        }
      } catch {
        console.log(`[SCRAPER] No more 'Load more' buttons for player ${playerID}.`);
        break; 
      }
    }
    
    const extractedData = await page.evaluate(() => {
      const nameEl = document.querySelector('header > span.font-HEAD');
      const playerName = nameEl ? nameEl.textContent.trim() : '';

      const opponents = [];
      const processedOpponentIds = new Set();
      const opponentLinks = document.querySelectorAll('a.col-span-2');

      opponentLinks.forEach((el) => {
        const href = el.getAttribute('href');
        const id = href ? href.split('=')[1] : null;
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
    return extractedData;

  } catch(e) {
      console.error(`[SCRAPER] A critical error occurred during the scrape for player ${playerID}: ${e.message}`);
      // Re-throw the error so the calling service knows it failed
      throw e;
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[SCRAPER] Closed browser for player: ${playerID}`);
    }
  }
};

module.exports = { scrapeLogic };

