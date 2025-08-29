// backend/utils/goldDataUtils.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_PATH = path.join(__dirname, '../data/gold_lkr_history.csv');
const TROY_OZ_TO_GRAMS = 31.1034768; // Standard conversion factor
const PREDICTION_DAYS = 5; // <-- How many previous days to average for prediction

let goldDataCache = null;

function loadGoldData() {
    if (goldDataCache) {
        return goldDataCache;
    }

    // *** Check if file exists ***
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`CRITICAL: Gold data CSV file not found at: ${CSV_PATH}`);
        // On critical error, maybe throw or handle differently, but returning empty is safe for consumers
        return []; // Return empty array if file doesn't exist
    }

    try {
        const fileContent = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' });
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            // Note: csv-parse doesn't automatically cast dates robustly. Manual parsing is safer.
        });

        // Convert values, parse dates, and sort by date descending (newest first)
        const parsedRecords = records.map(r => {
             // Basic validation and parsing
             const price = parseFloat(r.LKR_per_Oz);
             let date = null;
             try {
                 // Attempt to parse the date string. Use UTC to avoid timezone issues if possible,
                 // but standard Date parsing depends heavily on the input format.
                 // Consider a robust library like date-fns if formats are inconsistent.
                 const parsedDate = new Date(r.Date);
                 if (!isNaN(parsedDate.getTime())) { // Check if date is valid
                     date = parsedDate;
                 } else {
                     console.warn(`Invalid date format encountered in CSV: "${r.Date}". Skipping record.`);
                     // Keep date as null if invalid
                 }
             } catch (e) {
                  console.warn(`Error parsing date in CSV: "${r.Date}"`, e);
                  // Keep date as null on error
             }
             return {
                DateObj: date,      // Store Date object (or null if invalid)
                DateStr: r.Date,    // Keep original string
                LKR_per_Oz: isNaN(price) || price < 0 ? 0 : price // Default to 0 if price is invalid or negative
             };
         })
         // Filter out records with invalid dates *before* sorting
         .filter(r => r.DateObj !== null)
         parsedRecords.sort((a, b) => a.DateObj.getTime() - b.DateObj.getTime());
         parsedRecords.reverse(); // Now, latest record is at index 0// Sort by Date object time (newest first)

        goldDataCache = parsedRecords;
        // console.log("Loaded and sorted Gold Data:", goldDataCache.slice(0, 5)); // Uncomment for Debugging
        return goldDataCache;
    } catch (error) {
        console.error(`Error loading or parsing gold data CSV (${CSV_PATH}):`, error);
        return []; // Return empty array on error
    }
}


function getRecentGoldData(days = 7) {
    const allData = loadGoldData();
    // Return the actual data points, using the structure produced by loadGoldData
    return allData.slice(0, days).map(d => ({
        Date: d.DateStr, // Use the original string date
        LKR_per_Oz: d.LKR_per_Oz
    }));
}

// --- V V V UPDATED FUNCTION WITH NEW PREDICTION LOGIC V V V ---
function getGoldMarketSummary() {
    const allData = loadGoldData();

    // --- Base Case: Not enough data ---
    if (!allData || allData.length < 2) { // Need at least 2 for daily change, more for better prediction/periods
        console.warn(`Insufficient gold data for summary. Found ${allData ? allData.length : 0} valid records.`);
        return {
            latestPricePerOz: 0,
            latestPricePerGram: 0,
            latestDate: null,
            previousPricePerOz: 0,
            priceChangePercent: 0, // Daily change
            trend: 'stable',
            previousDaysData: [],
            weeklyChangePercent: 0,
            monthlyChangePercent: 0,
            predictedTomorrowPricePerGram: 0,
            predictedTomorrowChangePercent: 0,
        };
    }

    const latestRecord = allData[0];
    const latestPriceOz = latestRecord.LKR_per_Oz || 0;
    const latestPriceGram = latestPriceOz / TROY_OZ_TO_GRAMS;
    const latestDateStr = latestRecord.DateStr; // Use original string date for display

    // --- Daily Change (Compared to Previous Day) ---
    const previousRecord = allData[1]; // The immediately preceding day's record
    const previousPriceOz = previousRecord.LKR_per_Oz || 0;
    let dailyChangePercent = 0;
    let trend = 'stable';

    if (previousPriceOz > 0) {
        dailyChangePercent = ((latestPriceOz - previousPriceOz) / previousPriceOz) * 100;
    } else if (latestPriceOz > 0) {
        // Handle case where previous price was 0 or invalid, but latest is valid
        dailyChangePercent = Infinity; // Or some other indicator of a large relative change
    }
    // Note: Keep dailyChangePercent potentially as Infinity for internal logic, sanitize for output later if needed.

    // Adjust trend thresholds if desired
    if (dailyChangePercent > 0.5) trend = 'up';
    else if (dailyChangePercent < -0.5) trend = 'down';
    else if (!isFinite(dailyChangePercent) && latestPriceOz > 0) trend = 'volatile'; // Indicate large jump from/to zero


    // --- Weekly Change Calculation ---
    let weeklyChangePercent = 0;
    const sevenDaysAgoTarget = new Date(latestRecord.DateObj);
    sevenDaysAgoTarget.setDate(sevenDaysAgoTarget.getDate() - 7);

    // Find the record closest to 7 days ago. Iterate backwards since data is sorted newest first.
    let weekAgoRecord = null;
    for (let i = 1; i < allData.length; i++) { // Start from index 1 (previous day)
        if (allData[i].DateObj <= sevenDaysAgoTarget) {
            // Found the first record that is on or before 7 days ago.
            // Check if the *next* record (i-1, which is newer) is actually closer to the target date.
            if (i > 0) { // Ensure i-1 is valid index
                 const diffCurrent = Math.abs(allData[i].DateObj.getTime() - sevenDaysAgoTarget.getTime());
                 const diffPrevious = Math.abs(allData[i-1].DateObj.getTime() - sevenDaysAgoTarget.getTime());
                 // Choose the record with the minimum time difference from the target date
                 weekAgoRecord = diffCurrent <= diffPrevious ? allData[i] : allData[i-1];
            } else {
                 // This case should not be reachable if i starts at 1, but included for safety
                 weekAgoRecord = allData[i];
            }
            break; // Found the best candidate zone
        }
    }
    // Fallback: If loop finished without finding a record <= 7 days ago, use the oldest available up to roughly 7 days back
    if (!weekAgoRecord && allData.length > 1) {
        // Use the 7th previous record if available, otherwise the oldest record we have
        weekAgoRecord = allData[Math.min(allData.length - 1, 7)]; // Index 7 corresponds to the 8th item (approx 7 days back)
    }

    if (weekAgoRecord && weekAgoRecord.LKR_per_Oz > 0 && weekAgoRecord.DateObj.getTime() !== latestRecord.DateObj.getTime()) {
        weeklyChangePercent = ((latestPriceOz - weekAgoRecord.LKR_per_Oz) / weekAgoRecord.LKR_per_Oz) * 100;
    } else if (weekAgoRecord && latestPriceOz > 0 && weekAgoRecord.LKR_per_Oz <= 0) {
        weeklyChangePercent = Infinity; // Indicate large jump from zero/invalid
    }


    // --- Monthly Change Calculation ---
    // Find the price from roughly one month ago (closest record to 30 days prior).
    let monthlyChangePercent = 0;
    const thirtyDaysAgoTarget = new Date(latestRecord.DateObj);
    thirtyDaysAgoTarget.setDate(thirtyDaysAgoTarget.getDate() - 30);

    let monthAgoRecord = null;
    for (let i = 1; i < allData.length; i++) {
        if (allData[i].DateObj <= thirtyDaysAgoTarget) {
            // Found first record on or before target. Check if the next newer one (i-1) is closer.
            if (i > 0) { // Ensure i-1 is valid index
                 const diffCurrent = Math.abs(allData[i].DateObj.getTime() - thirtyDaysAgoTarget.getTime());
                 const diffPrevious = Math.abs(allData[i-1].DateObj.getTime() - thirtyDaysAgoTarget.getTime());
                 monthAgoRecord = diffCurrent <= diffPrevious ? allData[i] : allData[i-1];
            } else {
                 monthAgoRecord = allData[i];
            }
            break; // Found best candidate zone
        }
    }
    // Fallback: If no record found around 30 days ago, use oldest available up to roughly 30 days back
    if (!monthAgoRecord && allData.length > 1) {
        // Use 30th previous record if available, else the oldest record we have
        monthAgoRecord = allData[Math.min(allData.length - 1, 30)]; // Index 30 corresponds to 31st item
    }

    if (monthAgoRecord && monthAgoRecord.LKR_per_Oz > 0 && monthAgoRecord.DateObj.getTime() !== latestRecord.DateObj.getTime()) {
        monthlyChangePercent = ((latestPriceOz - monthAgoRecord.LKR_per_Oz) / monthAgoRecord.LKR_per_Oz) * 100;
    } else if (monthAgoRecord && latestPriceOz > 0 && monthAgoRecord.LKR_per_Oz <= 0) {
        monthlyChangePercent = Infinity;
    }


    // --- V V V NEW Prediction Logic: Average Daily Change V V V ---
    let predictedTomorrowPriceGram = latestPriceGram; // Default to today's price
    let predictedTomorrowChangePercent = 0; // Default to 0% change
    let sumPercentChanges = 0;
    let numChangesCalculated = 0;

    // Need at least PREDICTION_DAYS + 1 records to calculate PREDICTION_DAYS changes
    const requiredRecords = PREDICTION_DAYS + 1;
    if (allData.length >= requiredRecords) {
        // Calculate the change for each of the last PREDICTION_DAYS
        for (let i = 0; i < PREDICTION_DAYS; i++) {
            const currentDayRecord = allData[i];     // e.g., i=0 is latest
            const previousDayRecord = allData[i + 1]; // e.g., i=0 compares latest with previous (allData[1])

            // Ensure previous day's price is valid for calculation
            if (previousDayRecord && previousDayRecord.LKR_per_Oz > 0) {
                const priceCurrent = currentDayRecord.LKR_per_Oz;
                const pricePrevious = previousDayRecord.LKR_per_Oz;
                const dailyPctChange = (priceCurrent - pricePrevious) / pricePrevious; // Calculate as fraction
                sumPercentChanges += dailyPctChange;
                numChangesCalculated++;
            } else {
                // Optionally log if skipping a day due to zero price
                // console.log(`Skipping day ${i+1} in prediction average due to zero/invalid price.`);
            }
        }

        if (numChangesCalculated > 0) {
            const avgDailyPercentChange = sumPercentChanges / numChangesCalculated; // Average fractional change
            predictedTomorrowChangePercent = avgDailyPercentChange * 100; // Convert average fraction to percentage for reporting

            // Predict tomorrow's price based on the average change from today's price
            const predictedTomorrowPriceOz = latestPriceOz * (1 + avgDailyPercentChange);
            predictedTomorrowPriceGram = predictedTomorrowPriceOz / TROY_OZ_TO_GRAMS;

            // Ensure predicted price isn't negative
            if (predictedTomorrowPriceGram < 0) predictedTomorrowPriceGram = 0;

        }
        // If numChangesCalculated is 0 (e.g., all previous prices were 0), the default values (latest price, 0% change) remain.
    } else {
         // Optional: Fallback if not enough data for the desired prediction window
         console.warn(`Not enough data (${allData.length}) for ${PREDICTION_DAYS}-day prediction average. Using simple daily change for prediction fallback.`);
         // Fallback using the simple daily change calculated earlier
         if (isFinite(dailyChangePercent)) {
             predictedTomorrowChangePercent = dailyChangePercent; // Use the single daily change %
             const predictedTomorrowPriceOz = latestPriceOz * (1 + (dailyChangePercent / 100));
             predictedTomorrowPriceGram = predictedTomorrowPriceOz / TROY_OZ_TO_GRAMS;
             if (predictedTomorrowPriceGram < 0) predictedTomorrowPriceGram = 0;
         } else {
             // If even daily change is infinite, keep the default (latest price, 0% change)
             predictedTomorrowChangePercent = 0;
             predictedTomorrowPriceGram = latestPriceGram;
         }
    }
    // --- ^ ^ ^ END NEW Prediction Logic ^ ^ ^ ---


    // --- Previous Days Data ---
    // Get up to 4 previous data points *including* the latest one, then reverse for chronological order display
    const previousDaysData = allData.slice(0, 4).map(d => ({
        date: d.DateStr, // Use original string date
        pricePerOz: d.LKR_per_Oz || 0
    })).reverse(); // Newest last for charting typically

    // --- Sanitize Infinite Percentages for Output ---
    // Decide how to represent infinite change (e.g., return null, 0, or a very large number?)
    // Returning 0 might be misleading. Null could be better. Let's stick with 0 for now as per original code's tendency.
    const safeDailyChange = isFinite(dailyChangePercent) ? dailyChangePercent : 0;
    const safeWeeklyChange = isFinite(weeklyChangePercent) ? weeklyChangePercent : 0;
    const safeMonthlyChange = isFinite(monthlyChangePercent) ? monthlyChangePercent : 0;
    // Prediction change % should already be finite based on the logic above.

    return {
        latestPricePerOz: latestPriceOz,
        latestPricePerGram: latestPriceGram,
        latestDate: latestDateStr,
        previousPricePerOz: previousPriceOz, // Previous *day's* price
        priceChangePercent: safeDailyChange, // Daily change %
        trend: trend,
        previousDaysData: previousDaysData,
        weeklyChangePercent: safeWeeklyChange,
        monthlyChangePercent: safeMonthlyChange,
        // --- Use the newly calculated prediction values ---
        predictedTomorrowPricePerGram: predictedTomorrowPriceGram,
        predictedTomorrowChangePercent: predictedTomorrowChangePercent, // Should be finite
    };
}
// --- ^ ^ ^ END UPDATED FUNCTION ^ ^ ^ ---

module.exports = {
    loadGoldData,
    getRecentGoldData,
    getGoldMarketSummary
};
