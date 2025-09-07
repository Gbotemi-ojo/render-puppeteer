const puppeteer = require("puppeteer");

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

    // --- FIX ---
    // Explicitly wait for the player name element to be visible on the page.
    // If this fails, it means the page isn't loaded correctly, and we should stop.
    const playerNameSelector = 'header > span.font-HEAD';
    try {
        await page.waitForSelector(playerNameSelector, { timeout: 30000 });
        console.log(`[SCRAPER] Player profile for ${playerID} loaded successfully.`);
    } catch (error) {
        console.error(`[SCRAPER] Timed out waiting for player name element for player ${playerID}. The page may be blocked or failed to load.`);
        throw new Error(`Could not find player name element. Scraping aborted.`);
    }


    // Loop to click "Load more" until it's no longer available
    for (let i = 0; i < 400; i++) { // Safety break after 400 clicks
      try {
        const loadMoreButtonXPath = "//button[contains(text(), 'Load more')]";
        const buttonHandle = await page.waitForSelector('xpath/' + loadMoreButtonXPath, { timeout: 3000 });

        if (buttonHandle) {
          await buttonHandle.click();
          await page.waitForSelector('svg.animate-spin', { hidden: true, timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 2000));
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
    
    // Add a check to warn if the name is still empty after a successful wait.
    if (!extractedData.playerName) {
        console.warn(`[SCRAPER] Warning: Could not extract player name text for ${playerID}, though the header element was found.`);
    }


    console.log(`[SCRAPER] Scraped ${extractedData.opponents.length} opponents for player "${extractedData.playerName}".`);
    return extractedData;

  } catch (error) {
      console.error(`[SCRAPER] A critical error occurred during the scrape for player ${playerID}:`, error.message);
      // Re-throw the error to ensure the calling service knows about the failure.
      throw error;
  } 
  finally {
    if (browser) {
      await browser.close();
      console.log(`[SCRAPER] Closed browser for player: ${playerID}`);
    }
  }
};

module.exports = { scrapeLogic };
