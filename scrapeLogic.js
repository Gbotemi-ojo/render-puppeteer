const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios'); // Required for sending data chunks
puppeteer.use(StealthPlugin());

/**
 * A helper function to extract all opponents currently visible on the page.
 * This helps avoid repeating code inside the loop.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
const extractOpponents = async (page) => {
  return await page.evaluate(() => {
    const opponents = [];
    document.querySelectorAll('a.col-span-2').forEach((el) => {
      const href = el.getAttribute('href');
      const id = href ? href.split('=')[1] : null;
      const nameEl = el.querySelector('p');
      const name = nameEl ? nameEl.textContent.trim() : '';
      if (id && name) {
        opponents.push({ id, name });
      }
    });
    return opponents;
  });
};


/**
 * The main scraping logic, refactored to run as a background job and send data in chunks.
 * @param {string} playerID The ID of the player to scrape.
 * @param {string} callbackUrl The URL of the main service to POST data chunks back to.
 */
const scrapeLogic = async (playerID, callbackUrl) => {
  let browser = null;
  console.log(`[SCRAPER] Starting job for player: ${playerID}`);

  try {
    const launchOptions = {
      headless: true,
      args: ["--disable-setuid-sandbox", "--no-sandbox", "--single-process", "--no-zygote"],
      executablePath: process.env.NODE_ENV === "production" ? process.env.PUPPETEER_EXECUTABLE_PATH : require('puppeteer').executablePath(),
    };
    
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    const url = `https://tracker.ftgames.com/?id=${playerID}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

    const playerName = await page.evaluate(() => {
        const nameEl = document.querySelector('header > span.font-HEAD');
        return nameEl ? nameEl.textContent.trim() : '';
    });
    
    // This Set will keep track of all opponent IDs we've already sent to the main app
    // to ensure we don't send duplicates.
    let allFoundOpponentIds = new Set();
    const MAX_CLICKS = 50; // A reasonable limit to prevent infinite loops

    for (let i = 0; i < MAX_CLICKS; i++) {
      let opponentsOnPage = await extractOpponents(page);
      
      // On the first pass, send the main player's name along with the first chunk of opponents.
      if (i === 0) {
          const initialChunk = opponentsOnPage.filter(op => !allFoundOpponentIds.has(op.id));
          initialChunk.forEach(op => allFoundOpponentIds.add(op.id));
          if(initialChunk.length > 0) {
            console.log(`[SCRAPER] Sending initial chunk with ${initialChunk.length} opponents for player "${playerName}".`);
            // The first chunk includes the playerName
            await axios.post(callbackUrl, { playerName, playerId: playerID, opponents: initialChunk });
          }
      }

      // Now, try to find and click the "Load more" button
      try {
        const loadMoreButtonXPath = "//button[contains(text(), 'Load more')]";
        const buttonHandle = await page.waitForSelector('xpath/' + loadMoreButtonXPath, { timeout: 5000 });

        if (buttonHandle) {
          console.log(`[SCRAPER] Clicking 'Load more'... (${i + 1}/${MAX_CLICKS})`);
          await buttonHandle.click();
          await page.waitForSelector('svg.animate-spin', { hidden: true, timeout: 20000 });
          
          let opponentsAfterClick = await extractOpponents(page);
          // Find only the new opponents that we haven't sent yet
          const newOpponents = opponentsAfterClick.filter(op => !allFoundOpponentIds.has(op.id));
          
          if (newOpponents.length > 0) {
              newOpponents.forEach(op => allFoundOpponentIds.add(op.id));
              console.log(`[SCRAPER] Found ${newOpponents.length} new opponents. Sending chunk...`);
              // Subsequent chunks do not need the playerName
              await axios.post(callbackUrl, { playerId: playerID, opponents: newOpponents });
          }
        } else {
          // This case handles when the button exists initially but then disappears.
          break; 
        }
      } catch {
        // This case handles when the button is not found at all, meaning we're done.
        console.log(`[SCRAPER] No more 'Load more' buttons for player ${playerID}.`);
        break; 
      }
    }
    console.log(`[SCRAPER] Finished job for player ${playerID}. Found ${allFoundOpponentIds.size} total opponents.`);

  } catch(e) {
      console.error(`[SCRAPER] A critical error occurred during the scrape for player ${playerID}: ${e.message}`);
      // In this architecture, we just log the error. The main app is no longer waiting.
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[SCRAPER] Closed browser for player: ${playerID}`);
    }
  }
};

module.exports = { scrapeLogic };

