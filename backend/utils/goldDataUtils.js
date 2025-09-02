// backend/utils/goldDataUtils.js

const GoldPrice = require('../models/GoldPrice'); // Import the Mongoose model

// --- Constants ---
const TROY_OZ_TO_GRAMS = 31.1034768;
const PREDICTION_DAYS = 5;

// ===================================================================================
// DATA WRITING FUNCTION (Replaces the old csvUtils.js functionality)
// ===================================================================================

/**
 * Saves or updates a gold price record in the MongoDB database for a specific date.
 * This is an "upsert" operation: it updates if the date exists, or inserts if it doesn't.
 * @param {string} dateStr - The date in 'YYYY-MM-DD' format.
 * @param {number} pricePerGramLKR - The price in LKR per gram.
 * @returns {Promise<void>}
 */
const savePriceToDb = async (dateStr, pricePerGramLKR) => {
    try {
        const pricePerOz = pricePerGramLKR * TROY_OZ_TO_GRAMS;
        const recordDate = new Date(dateStr);

        // Find a document with this date and update it, or create it if it doesn't exist (upsert: true)
        await GoldPrice.findOneAndUpdate(
            { Date: recordDate }, // The query to find the document.
            { // The data to set on the document.
                $set: {
                    LKR_per_Oz: pricePerOz,
                    LKR_per_XAU_Inverse:0,
                }
            },
            {
                upsert: true, // Creates a new document if one doesn't match the query.
            }
        );
        console.log(`Successfully upserted gold price for ${dateStr} into MongoDB.`);
    } catch (error) {
        console.error(`Error saving price to MongoDB for date ${dateStr}:`, error);
        throw error; // Propagate the error to the caller.
    }
};


// ===================================================================================
// DATA READING & ANALYSIS FUNCTIONS (Replaces CSV reading)
// ===================================================================================

/**
 * Loads all historical gold price data from MongoDB, sorted by most recent.
 * @returns {Promise<Array>} A promise that resolves to an array of sorted gold data records.
 */
async function loadGoldData() {
    try {
        // Fetch records from MongoDB, sort by date descending, and use .lean() for performance.
        const today = new Date();
        today.setUTCHours(23, 59, 59, 999);

        // Fetch records from MongoDB where the date is less than or equal to today,
        // sorted by date descending. .lean() is used for performance.
        const records = await GoldPrice.find({ Date: { $lte: today } })
            .sort({ Date: -1 })
            .lean();

        if (!records || records.length === 0) {
            console.warn('No valid gold data found in MongoDB.');
            return [];
        }

        // Map the database records to the structure expected by the summary function.
        // This keeps the analysis logic separate from the data source structure.
        return records.map(r => ({
            DateObj: r.Date,
            DateStr: r.Date.toISOString().split('T')[0], // 'YYYY-MM-DD'
            LKR_per_Oz: r.LKR_per_Oz
        }));
    } catch (error) {
        console.error('Error loading gold data from MongoDB:', error);
        return []; // Return an empty array on failure.
    }
}

/**
 * Generates a comprehensive market summary using data from MongoDB.
 * @returns {Promise<Object>} A promise that resolves to the market summary object.
 */
async function getRecentGoldData(days = 7) {
    const allData = await loadGoldData();
    return allData.slice(0, days);
}
async function getGoldMarketSummary() {
    const allData = await loadGoldData();

    // --- Base Case: Handle not enough data ---
    if (!allData || allData.length < 2) {
        return {
            latestPricePerOz: 0, latestPricePerGram: 0, latestDate: null,
            previousPricePerOz: 0, priceChangePercent: 0, trend: 'stable',
            previousDaysData: [], weeklyChangePercent: 0, monthlyChangePercent: 0,
            predictedTomorrowPricePerGram: 0, predictedTomorrowChangePercent: 0,
        };
    }

    // --- All calculation logic below remains the same ---
    const latestRecord = allData[0];
    const latestPriceOz = latestRecord.LKR_per_Oz || 0;
    const latestPriceGram = latestPriceOz / TROY_OZ_TO_GRAMS;
    const latestDateStr = latestRecord.DateStr;

    // Daily Change
    const previousRecord = allData[1];
    const previousPriceOz = previousRecord.LKR_per_Oz || 0;
    let dailyChangePercent = previousPriceOz > 0 ? ((latestPriceOz - previousPriceOz) / previousPriceOz) * 100 : 0;
    
    let trend = 'stable';
    if (dailyChangePercent > 0.5) trend = 'up';
    else if (dailyChangePercent < -0.5) trend = 'down';

    // Weekly Change
    const sevenDaysAgoTarget = new Date(latestRecord.DateObj);
    sevenDaysAgoTarget.setDate(sevenDaysAgoTarget.getDate() - 7);
    const weekAgoRecord = allData.find(d => d.DateObj <= sevenDaysAgoTarget) || allData[Math.min(allData.length - 1, 7)];
    let weeklyChangePercent = (weekAgoRecord && weekAgoRecord.LKR_per_Oz > 0) ? ((latestPriceOz - weekAgoRecord.LKR_per_Oz) / weekAgoRecord.LKR_per_Oz) * 100 : 0;

    // Monthly Change
    const thirtyDaysAgoTarget = new Date(latestRecord.DateObj);
    thirtyDaysAgoTarget.setDate(thirtyDaysAgoTarget.getDate() - 30);
    const monthAgoRecord = allData.find(d => d.DateObj <= thirtyDaysAgoTarget) || allData[Math.min(allData.length - 1, 30)];
    let monthlyChangePercent = (monthAgoRecord && monthAgoRecord.LKR_per_Oz > 0) ? ((latestPriceOz - monthAgoRecord.LKR_per_Oz) / monthAgoRecord.LKR_per_Oz) * 100 : 0;

    // Prediction Logic
    let predictedTomorrowPriceGram = latestPriceGram;
    let predictedTomorrowChangePercent = 0;
    if (allData.length >= PREDICTION_DAYS + 1) {
        const recentChanges = [];
        for (let i = 0; i < PREDICTION_DAYS; i++) {
            if (allData[i + 1] && allData[i + 1].LKR_per_Oz > 0) {
                recentChanges.push((allData[i].LKR_per_Oz - allData[i + 1].LKR_per_Oz) / allData[i + 1].LKR_per_Oz);
            }
        }
        if (recentChanges.length > 0) {
            const avgChange = recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length;
            predictedTomorrowPriceGram = (latestPriceOz * (1 + avgChange)) / TROY_OZ_TO_GRAMS;
            predictedTomorrowChangePercent = avgChange * 100;
        }
    }

    // --- Final Data Assembly ---
    return {
        latestPricePerOz: latestPriceOz,
        latestPricePerGram: latestPriceGram,
        latestDate: latestDateStr,
        previousPricePerOz: previousPriceOz,
        priceChangePercent: isFinite(dailyChangePercent) ? dailyChangePercent : 0,
        trend: trend,
        previousDaysData: allData.slice(0, 7).map(d => ({ date: d.DateStr, pricePerOz: d.LKR_per_Oz })).reverse(),
        weeklyChangePercent: isFinite(weeklyChangePercent) ? weeklyChangePercent : 0,
        monthlyChangePercent: isFinite(monthlyChangePercent) ? monthlyChangePercent : 0,
        predictedTomorrowPricePerGram: predictedTomorrowPriceGram < 0 ? 0 : predictedTomorrowPriceGram,
        predictedTomorrowChangePercent: isFinite(predictedTomorrowChangePercent) ? predictedTomorrowChangePercent : 0,
    };
}


// ===================================================================================
// EXPORTS
// ===================================================================================

module.exports = {
    savePriceToDb,
    loadGoldData,
    getRecentGoldData,
    getGoldMarketSummary,
};
