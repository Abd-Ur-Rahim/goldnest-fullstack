// backend/utils/csvUtils.js
const fs = require('fs');
const path = require('path');
const { format } = require('fast-csv');

const CSV_PATH = path.join(__dirname, '../data/gold_lkr_history.csv');
const TROY_OZ_TO_GRAMS = 31.1034768;

/**
 * Appends a new price record to the gold history CSV.
 * @param {string} dateStr - The date in 'YYYY-MM-DD' format.
 * @param {number} pricePerGramLKR - The price in LKR per gram.
 * @returns {Promise<void>}
 */
const appendPriceToCsv = (dateStr, pricePerGramLKR) => {
    return new Promise((resolve, reject) => {
        // First, check if the file exists. If not, we might need to create it with headers.
        const fileExists = fs.existsSync(CSV_PATH);
        
        // Convert price per gram back to price per Troy Ounce for consistency with the CSV
        const pricePerOz = pricePerGramLKR * TROY_OZ_TO_GRAMS;

        const newRow = {
            Date: dateStr,
            LKR_per_Oz: pricePerOz.toFixed(2),
            LKR_per_XAU_Inverse:0// Ensure it's a string with 2 decimal places
        };
        
        // Use append mode for the write stream
        const ws = fs.createWriteStream(CSV_PATH, { flags: 'a' });

        const csvStream = format({ 
            headers: !fileExists, // Write headers only if the file is new
            includeEndRowDelimiter: true 
        });

        csvStream.pipe(ws)
            .on('error', err => reject(err))
            .on('finish', () => resolve());

        csvStream.write(newRow);
        csvStream.end();
    });
};
/*
 * @param {Date} date
 * @returns {string}
 */
const formatDateMDY = (date) => {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};
module.exports = { appendPriceToCsv,formatDateMDY };
