const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
puppeteer.use(StealthPlugin());

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

const scrapeLogic = async (playerID, callbackUrl) => {
  let browser = null;
  console.log(`[SCRAPER] Starting job for player: ${playerID}`);
  
  // --- NEW: Construct the two different callback URLs from the base URL provided ---
  const chunkCallbackUrl = `${callbackUrl}`; // The existing one for sending data
  const completionCallbackUrl = callbackUrl.replace('/submit-chunk', '/complete-job'); // The new one for signaling completion

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
    
    let allFoundOpponentIds = new Set();
    const MAX_CLICKS = 50;

    for (let i = 0; i < MAX_CLICKS; i++) {
      let opponentsOnPage = await extractOpponents(page);
      
      if (i === 0) {
          const initialChunk = opponentsOnPage.filter(op => !allFoundOpponentIds.has(op.id));
          initialChunk.forEach(op => allFoundOpponentIds.add(op.id));
          if(initialChunk.length > 0) {
            console.log(`[SCRAPER] Sending initial chunk with ${initialChunk.length} opponents for player "${playerName}".`);
            await axios.post(chunkCallbackUrl, { playerName, playerId: playerID, opponents: initialChunk });
          }
      }

      try {
        const loadMoreButtonXPath = "//button[contains(text(), 'Load more')]";
        const buttonHandle = await page.waitForSelector('xpath/' + loadMoreButtonXPath, { timeout: 5000 });

        if (buttonHandle) {
          await buttonHandle.click();
          await page.waitForSelector('svg.animate-spin', { hidden: true, timeout: 20000 });
          
          let opponentsAfterClick = await extractOpponents(page);
          const newOpponents = opponentsAfterClick.filter(op => !allFoundOpponentIds.has(op.id));
          
          if (newOpponents.length > 0) {
              newOpponents.forEach(op => allFoundOpponentIds.add(op.id));
              console.log(`[SCRAPER] Found ${newOpponents.length} new opponents. Sending chunk...`);
              await axios.post(chunkCallbackUrl, { playerId: playerID, opponents: newOpponents });
          }
        } else {
          break; 
        }
      } catch {
        console.log(`[SCRAPER] No more 'Load more' buttons for player ${playerID}.`);
        break; 
      }
    }
    console.log(`[SCRAPER] Finished job for player ${playerID}. Found ${allFoundOpponentIds.size} total opponents.`);

  } catch(e) {
      console.error(`[SCRAPER] A critical error occurred during the scrape for player ${playerID}: ${e.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[SCRAPER] Closed browser for player: ${playerID}`);
    }
    // --- NEW: Send the completion signal after the browser is closed ---
    // This runs whether the scrape succeeded or failed, ensuring the worker lock is always released.
    try {
        console.log(`[SCRAPER] Sending completion signal for player ${playerID} to ${completionCallbackUrl}`);
        await axios.post(completionCallbackUrl, { playerId: playerID });
    } catch(e) {
        console.error(`[SCRAPER] Failed to send completion signal for player ${playerID}:`, e.message);
    }
  }
};

module.exports = { scrapeLogic };

