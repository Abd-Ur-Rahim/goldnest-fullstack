const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Scrapes the latest gold price from the Central Bank of Sri Lanka website.
 * This function handles navigation, iframe interaction, form submission, and data extraction.
 * It is designed to be resilient, with explicit waits and robust error handling.
 */
const scrapeGoldPrice = async () => {
    let browser = null;
    let page = null;
    console.log('[Scraper] Launching browser...');
    
    try {
        // Launch the browser with necessary arguments for server environments
        browser = await puppeteer.launch({
            headless: true, // Run in the background without a UI
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for many Linux environments
        });
        
        page = await browser.newPage();
        
        // --- PRIMARY FIX ---
        // Set a default viewport size. This is crucial. It ensures the page
        // has dimensions (width > 0), preventing the "Cannot take screenshot with 0 width"
        // error if navigation fails and the script jumps to the catch block.
        await page.setViewport({ width: 1366, height: 768 });

        const url = 'https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates/daily-gold-rates';
        
        console.log(`[Scraper] Navigating to ${url}...`);
        // Navigate to the page and wait until network activity has settled.
        // Increased timeout for better reliability on slow networks.
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // --- IFRAME HANDLING LOGIC ---

        // 1. Wait for the iframe to be present on the page.
        const iframeSelector = 'iframe[src="/cbsl_custom/exrates/exratesgold.php"]';
        console.log(`[Scraper] Waiting for the form iframe ("${iframeSelector}")...`);
        await page.waitForSelector(iframeSelector, { timeout: 20000 });
        const elementHandle = await page.$(iframeSelector);
        
        // Add a check to ensure the iframe element was actually found.
        if (!elementHandle) {
            throw new Error('Could not find the iframe element on the page.');
        }
        
        // 2. Switch the scraper's context to the content inside the iframe.
        const frame = await elementHandle.contentFrame();
        if (!frame) {
            throw new Error('Could not get the content frame of the iframe.');
        }
        console.log('[Scraper] Successfully switched context to inside the iframe.');

        // --- INTERACTIONS WITHIN THE IFRAME ---
        // All subsequent actions are performed on the 'frame' object.

        // 3. Find and click the "Quick Date" radio button.
        const radioSelector = 'input#rangeType_range';
        console.log(`[Scraper] Inside iframe, waiting for "Quick Date" radio button ("${radioSelector}")...`);
        await frame.waitForSelector(radioSelector, { visible: true, timeout: 15000 });
        await frame.click(radioSelector);
        console.log('[Scraper] Clicked the "Quick Date" radio button.');

        // 4. Find the dropdown and select the "60 days" option.
        const dropdownSelector = 'select#rangeValue';
        console.log(`[Scraper] Inside iframe, waiting for dropdown ("${dropdownSelector}")...`);
        await frame.waitForSelector(dropdownSelector, { visible: true, timeout: 10000 });
        await frame.select(dropdownSelector, '60');
        console.log('[Scraper] Selected "60 days" from the dropdown.');

        // 5. Click the submit button and wait for the iframe to reload.
        const submitButtonSelector = 'button[type="submit"], input[type="submit"]';
        console.log('[Scraper] Inside iframe, clicking submit...');
        // Use Promise.all to perform the click and wait for the resulting navigation simultaneously.
        await Promise.all([
            frame.click(submitButtonSelector),
            frame.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }) 
        ]);
        console.log('[Scraper] Iframe has reloaded with the data table.');

        // --- DATA EXTRACTION FROM IFRAME ---

        // 6. Wait for the results table to appear after submission.
        const resultsTableSelector = 'table.table';
        console.log('[Scraper] Inside iframe, waiting for results table...');
        await frame.waitForSelector(resultsTableSelector, { timeout: 15000 });
        console.log('[Scraper] Results table found. Extracting data...');

        // 7. Execute code within the browser context to extract the price.
        const latestPriceData = await frame.evaluate((tableSel) => {
            const table = document.querySelector(tableSel);
            if (!table) return null;
            
            const firstRow = table.querySelector('tbody tr');
            if (!firstRow) return null;
            
            // Extract text from the second cell (index 1) of the first row.
            const priceText = firstRow.cells[1]?.innerText.trim();
            if (priceText) {
                // Clean the text (remove commas) and convert to a number.
                const price = parseFloat(priceText.replace(/,/g, ''));
                return { price };
            }
            return null;
        }, resultsTableSelector);

        // 8. Validate the extracted data.
        if (latestPriceData && !isNaN(latestPriceData.price)) {
            console.log(`[Scraper] SUCCESS! Found most recent available price: ${latestPriceData.price}`);
            return latestPriceData;
        } else {
            throw new Error('Could not find or parse the price from the table inside the iframe.');
        }

    } catch (error) {
        // --- ROBUST ERROR HANDLING ---
        // Log the full error object, including the stack trace, for better debugging.
        console.error('[Scraper] FATAL ERROR during scraping process:', error); 

        if (page) {
            const screenshotPath = path.join(__dirname, '..', 'error.png');
            console.log(`[Scraper] Saving screenshot of the error page to: ${screenshotPath}`);
            try {
                // This screenshot will now work because of the setViewport call earlier.
                await page.screenshot({ path: screenshotPath, fullPage: true });
            } catch (screenshotError) {
                console.error('[Scraper] CRITICAL: Could not take screenshot even after fixes:', screenshotError.message);
            }
        }
        return null; // Ensure null is returned on failure.
    } finally {
        // --- CLEANUP ---
        // Always ensure the browser is closed to prevent memory leaks.
        if (browser) {
            console.log('[Scraper] Closing browser...');
            await browser.close();
        }
    }
};

module.exports = { scrapeGoldPrice };
