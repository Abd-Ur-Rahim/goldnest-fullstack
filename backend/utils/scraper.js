// backend/utils/scraper.js

const puppeteer = require('puppeteer');
const path = require('path');

const scrapeGoldPrice = async () => {
    let browser = null;
    let page = null;
    console.log('[Scraper] Launching browser...');
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        page = await browser.newPage();
        const url = 'https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates/daily-gold-rates';
        
        console.log(`[Scraper] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // --- FINAL, CORRECTED LOGIC WITH IFRAME HANDLING ---

        // STEP 1: Find the iframe that contains the form.
        const iframeSelector = 'iframe[src="/cbsl_custom/exrates/exratesgold.php"]';
        console.log(`[Scraper] Waiting for the form iframe ("${iframeSelector}")...`);
        await page.waitForSelector(iframeSelector, { timeout: 20000 });
        const elementHandle = await page.$(iframeSelector);
        
        // Switch the scraper's context to the content inside the iframe.
        const frame = await elementHandle.contentFrame();
        if (!frame) {
            throw new Error('Could not get the content frame of the iframe.');
        }
        console.log('[Scraper] Successfully switched context to inside the iframe.');

        // ALL SUBSEQUENT ACTIONS ARE PERFORMED ON THE 'frame' OBJECT.

        // STEP 2: Find and click the "Quick Date" radio button inside the iframe.
        const radioSelector = 'input#rangeType_range';
        console.log(`[Scraper] Inside iframe, waiting for "Quick Date" radio button ("${radioSelector}")...`);
        await frame.waitForSelector(radioSelector, { visible: true, timeout: 15000 });
        await frame.click(radioSelector);
        console.log('[Scraper] Clicked the "Quick Date" radio button.');

        // STEP 3: Find the dropdown inside the iframe and select "60 days".
        const dropdownSelector = 'select#rangeValue';
        console.log(`[Scraper] Inside iframe, waiting for dropdown ("${dropdownSelector}")...`);
        await frame.waitForSelector(dropdownSelector, { visible: true, timeout: 10000 });
        await frame.select(dropdownSelector, '60');
        console.log('[Scraper] Selected "60 days" from the dropdown.');

        // STEP 4: Click the submit button inside the iframe.
        const submitButtonSelector = 'button[type="submit"], input[type="submit"]'; // General submit selector
        console.log('[Scraper] Inside iframe, clicking submit...');
        // The form submission reloads the content within the iframe.
        await Promise.all([
            frame.click(submitButtonSelector),
            frame.waitForNavigation({ waitUntil: 'networkidle2' }) 
        ]);
        console.log('[Scraper] Iframe has reloaded with the data table.');

        // STEP 5: Find the table inside the iframe and extract the price.
        const resultsTableSelector = 'table.table';
        console.log('[Scraper] Inside iframe, waiting for results table...');
        await frame.waitForSelector(resultsTableSelector, { timeout: 10000 });
        console.log('[Scraper] Results table found. Extracting data...');

        const latestPriceData = await frame.evaluate((tableSel) => {
            const table = document.querySelector(tableSel);
            if (!table) return null;
            const firstRow = table.querySelector('tbody tr');
            if (!firstRow) return null;
            const priceText = firstRow.cells[1]?.innerText.trim();
            if (priceText) {
                const price = parseFloat(priceText.replace(/,/g, ''));
                return { price };
            }
            return null;
        }, resultsTableSelector);

        if (latestPriceData && !isNaN(latestPriceData.price)) {
            console.log(`[Scraper] SUCCESS! Found most recent available price: ${latestPriceData.price}`);
            return latestPriceData;
        } else {
            throw new Error('Could not find or parse the price from the table inside the iframe.');
        }

    } catch (error) {
        console.error('[Scraper] FATAL ERROR during scraping process:', error.message);
        if (page) {
            const screenshotPath = path.join(__dirname, '..', 'error.png');
            console.log(`[Scraper] Saving screenshot of the error page to: ${screenshotPath}`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
        }
        return null;
    } finally {
        if (browser) {
            console.log('[Scraper] Closing browser...');
            await browser.close();
        }
    }
};

module.exports = { scrapeGoldPrice };
