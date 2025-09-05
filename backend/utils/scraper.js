// backend/utils/scraper.js

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Scrapes the gold price from the Central Bank of Sri Lanka website.
 * @returns {Promise<{date: string, price: number}|null>} A promise that resolves to an object 
 * with the date and price, or null if scraping fails.
 */
const scrapeGoldPrice = async () => {
    try {
        // The URL of the page to scrape
        const url = 'https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates/daily-gold-rates';
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // This selector is crucial and targets the first data row in the gold rates table.
        // It might need adjustment if the website's HTML structure changes in the future.
        const priceRow = $('table.gold-rates tbody tr').first();

        // Check if the row was found
        if (priceRow.length) {
            // Extract the text from the first and second cells of the row
            const date = priceRow.find('td').eq(0).text().trim();
            const priceText = priceRow.find('td').eq(1).text().trim();

            // Ensure both date and price were extracted successfully
            if (date && priceText) {
                // Remove commas from the price and convert it to a number
                const price = parseFloat(priceText.replace(/,/g, ''));
                return { date, price };
            }
        }
        // Return null if the data couldn't be found
        return null;
    } catch (error) {
        console.error('Error scraping gold price:', error.message);
        return null;
    }
};

module.exports = { scrapeGoldPrice };