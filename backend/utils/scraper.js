// backend/utils/scraper.js

const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Scrapes the latest "Gold Ounce" price from ideabeam.com.
 * This final version correctly handles the interactive table by:
 * 1. Waiting for the table's JavaScript to initialize.
 * 2. Selecting "100" from the entries dropdown to ensure all data is visible.
 * 3. Waiting for the table to redraw.
 * 4. Scraping the first row for today's value.
 */
const scrapeGoldPrice = async () => {
    let browser = null;
    let page = null;
    console.log('[Scraper] Launching browser...');
    try {
        browser = await puppeteer.launch({
            headless: true, // It's often helpful to set this to false when debugging
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        page = await browser.newPage();

        // Mimic a real browser to prevent being blocked
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        );

        const url = 'https://www.ideabeam.com/finance/rates/goldprice.php'; 
        console.log(`[Scraper] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // --- INTERACTIVE SCRAPING LOGIC ---

        // STEP 1: Wait for the table's controls (the dropdown) to be visible.
        // This confirms that the DataTable JavaScript has finished running.
        const dropdownSelector = 'select[name="DataTables_Table_0_length"]';
        console.log(`[Scraper] Waiting for the entries dropdown ("${dropdownSelector}")...`);
        await page.waitForSelector(dropdownSelector, { visible: true, timeout: 30000 });
        console.log('[Scraper] Dropdown found.');

        // STEP 2: Select '100' from the dropdown to show all entries.
        await page.select(dropdownSelector, '100');
        console.log('[Scraper] Selected "100" from the dropdown.');

        // STEP 3: Wait for the table to update. A brief pause is often the simplest way.
        // A more robust method would be to wait for the "Showing 1 to 100" text, but a small delay works here.
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for redraw
        console.log('[Scraper] Waited for table to redraw.');

        // STEP 4: Scrape the data from the first row of the now-visible table.
        const tableSelector = 'table.datatable';
        console.log(`[Scraper] Extracting data from the first row of "${tableSelector}"...`);

        const latestPriceData = await page.evaluate((sel) => {
            const table = document.querySelector(sel);
            if (!table) return null;

            const firstRow = table.querySelector('tbody tr');
            if (!firstRow) return null;
            
            // The "Gold Ounce" price is in the second column (index 1).
            const priceCell = firstRow.cells[1];
            const priceText = priceCell?.innerText.trim();

            if (priceText) {
                const price = parseFloat(priceText.replace(/Rs\.\s*|,/g, ''));
                return { price };
            }
            
            return null;
        }, tableSelector);

        if (latestPriceData && !isNaN(latestPriceData.price)) {
            console.log(`[Scraper] SUCCESS! Found today's Gold Ounce price: ${latestPriceData.price}`);
            return latestPriceData;
        } else {
            throw new Error('Could not find or parse the "Gold Ounce" price after interacting with the page.');
        }

    } catch (error) {
        console.error('[Scraper] FATAL ERROR during scraping process:', error.message);
        if (page) {
            const screenshotPath = path.resolve(__dirname, '..', 'error_screenshot.png');
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