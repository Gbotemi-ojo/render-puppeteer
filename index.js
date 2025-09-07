const express = require("express");
const { scrapeLogic } = require("./scrapeLogic");
const app = express();

const PORT = process.env.PORT || 10000;

app.get("/scrape", (req, res) => {
  const { playerId, callbackUrl } = req.query;

  if (!playerId) {
    return res.status(400).send({ error: "Query parameter 'playerId' is required." });
  }
  if (!callbackUrl) {
    return res.status(400).send({ error: "Query parameter 'callbackUrl' is required." });
  }

  // Acknowledge the request immediately and start the long-running scrape in the background.
  // We do not use 'await' here, which is intentional. This prevents timeouts.
  scrapeLogic(playerId, callbackUrl).catch(error => {
    // Log any errors that happen during the asynchronous background process.
    console.error(`[BACKGROUND_ERROR] Scraping failed for player ${playerId}:`, error.message);
  });

  // Respond immediately to the main service to let it know we've accepted the job.
  res.status(202).send({ message: `Scraping job accepted for player ${playerId}.` });
});

app.get("/", (req, res) => {
  res.send("Scraper service is up and running!");
});

app.listen(PORT, () => {
  console.log(`Scraper service listening on port ${PORT}`);
});