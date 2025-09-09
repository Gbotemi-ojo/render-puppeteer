const express = require("express");
const scrapeLogic = require("./scrapeLogic");
const app = express();

const PORT = process.env.PORT || 10000;

// --- NEW: Worker Lock ---
// This flag ensures that only one scrape job can run at a time, preventing memory overload.
let isWorkerBusy = false;

// The scraper now expects a JSON body, so we need to use the express.json() middleware.
app.use(express.json());

// The main endpoint for scraping. It now accepts POST requests with a JSON body.
app.post("/scrape", (req, res) => {
  // --- NEW: Check the lock ---
  if (isWorkerBusy) {
    // If the scraper is already working, it rejects the new job with a 429 "Too Many Requests" status.
    // The main app is designed to handle this and will simply retry the job a few moments later.
    console.log("[SCRAPER_SERVER] Worker is busy. Rejecting new job.");
    return res.status(429).send({ message: "Scraper is currently busy. Please try again later." });
  }

  // We now get the data from the request body instead of query parameters.
  const { playerId, callbackUrl } = req.body;

  if (!playerId || !callbackUrl) {
    return res.status(400).send({ error: "Both 'playerId' and 'callbackUrl' are required in the request body." });
  }

  // --- NEW: Set the lock ---
  // As soon as a valid job is accepted, the worker is locked.
  isWorkerBusy = true;
  console.log(`[SCRAPER_SERVER] Worker locked for player: ${playerId}`);
  
  // Immediately accept the job so the main app can move on.
  res.status(202).send({ message: "Scrape job accepted and started." });

  // --- NEW: Define a callback to unlock the worker ---
  // This function will be passed down to the scraper logic.
  const onComplete = () => {
    isWorkerBusy = false;
    console.log(`[SCRAPER_SERVER] Worker unlocked. Ready for next job.`);
  };

  // Start the scraping job in the background and pass it the unlock function.
  // This is a "fire-and-forget" operation from the server's perspective.
  scrapeLogic(playerId, callbackUrl, onComplete);
});

// A root endpoint to check the server's status, including the worker lock.
app.get("/", (req, res) => {
  res.send(`Scraper service is up and running. Worker busy: ${isWorkerBusy}`);
});

app.listen(PORT, () => {
  console.log(`Scraper service listening on port ${PORT}`);
});
