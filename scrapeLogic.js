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

    await page.goto("https://developer.chrome.com/");

    // Set screen size
    await page.setViewport({ width: 1080, height: 1024 });

    // ⬇️ NEW LOGIC TO SCRAPE THE H2 ELEMENT ⬇️

    // This CSS selector targets the h2 element using the unique data-text attribute.
    // Note: The literal newline (\n) is included because it exists in the HTML attribute value.
    const headingSelector = 'h2[data-text="A Powerful Web. Made Easier.\n"]';
    
    // Wait for the element to be available
    await page.waitForSelector(headingSelector);

    // Evaluate the element: retrieve the content of its 'data-text' attribute.
    // Using .innerText would also work, but data-text already has the clean string.
    const headlineText = await page.$eval(headingSelector, (el) => 
      el.getAttribute('data-text')
    );

    // Clean up the text (remove the trailing newline) and send the response
    const logStatement = `Found homepage headline: ${headlineText.trim()}`;
    console.log(logStatement);
    res.send(logStatement);


    /* // === YOUR ORIGINAL SEARCH LOGIC ===
    // This code block is commented out because it navigates away from the page 
    // containing the h2 element you wanted to scrape.

    // Type into search box
    await page.type(".search-box__input", "automate beyond recorder");

    // Wait and click on first result
    const searchResultSelector = ".search-box__link";
    await page.waitForSelector(searchResultSelector);
    await page.click(searchResultSelector);

    // Locate the full title with a unique string
    const textSelector = await page.waitForSelector(
      "text/Customize and automate"
    );
    const fullTitle = await textSelector.evaluate((el) => el.textContent);

    // Print the full title
    const logStatementOriginal = `The title of this blog post is ${fullTitle}`;
    console.log(logStatementOriginal);
    res.send(logStatementOriginal);
    */

  } catch (e) {
    console.error(e);
    res.send(`Something went wrong while running Puppeteer: ${e}`);
  } finally {
    await browser.close();
  }
};

module.exports = { scrapeLogic };
