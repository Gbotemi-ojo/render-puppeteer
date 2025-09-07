const express = require("express");
const { scrapeLogic } = require("./scrapeLogic");
const app = express();

const PORT = process.env.PORT || 4000;

// The main endpoint for scraping. It expects a 'playerId' query parameter.
// Example: GET /scrape?playerId=sqjhh8hf
app.get("/scrape", async (req, res) => {
  const { playerId } = req.query;

  if (!playerId) {
    return res.status(400).send({ error: "Query parameter 'playerId' is required." });
  }

  try {
    const data = await scrapeLogic(playerId);
    res.send(data);
  } catch (error) {
    console.error(`Error during scraping for player ${playerId}:`, error);
    res.status(500).send({ error: `Something went wrong while scraping: ${error.message}` });
  }
});

// A root endpoint to check if the server is running.
app.get("/", (req, res) => {
  res.send("Scraper service is up and running!");
});

app.listen(PORT, () => {
  console.log(`Scraper service listening on port ${PORT}`);
});
