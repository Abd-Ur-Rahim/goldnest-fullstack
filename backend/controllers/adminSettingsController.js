// backend/controllers/adminSettingsController.js
const Setting = require('../models/Setting');
const { savePriceToDb } = require('../utils/goldDataUtils');
const { invalidateFeeCache } = require('../utils/feeUtils');
const { logAdminAction } = require('../services/auditLogService');
const { scrapeGoldPrice } = require('../utils/scraper');
const TROY_OZ_TO_GRAMS = 31.1034768;
// getSettings, updateSettings, and addGoldPriceEntry functions remain unchanged.
const getSettings = async (req, res) => {
    try {
        const settings = await Setting.find({});
        const settingsObject = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});
        res.json({ settings: settingsObject });
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({ message: "Error fetching settings." });
    }
};

const updateSettings = async (req, res) => {
    const { confirmationPassword, ...settingsToUpdate } = req.body;
    try {
        const keysToUpdate = Object.keys(settingsToUpdate);
        const oldSettings = await Setting.find({ key: { $in: keysToUpdate } });
        const undoData = oldSettings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        const updatePromises = Object.entries(settingsToUpdate).map(([key, value]) => {
            const parsedValue = !isNaN(parseFloat(value)) ? parseFloat(value) : value;
            return Setting.findOneAndUpdate(
                { key },
                { value: parsedValue },
                { upsert: true, new: true }
            );
        });
        await Promise.all(updatePromises);

        await logAdminAction(
            req.admin, 
            'Updated platform settings', 
            { type: 'Setting' }, 
            { updatedKeys: keysToUpdate },
            undoData
        );

        invalidateFeeCache();
        res.json({ message: 'Settings updated successfully.' });

    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ message: "Error updating settings." });
    }
};

const addGoldPriceEntry = async (req, res) => {
    const { date, price } = req.body;
    if (!date || !price || isNaN(parseFloat(price))) {
        return res.status(400).json({ message: 'Please provide a valid date and price.' });
    }

    try {
        const dateStr = new Date(date).toISOString().split('T')[0];
        await savePriceToDb(dateStr, parseFloat(price));

        await logAdminAction(
            req.admin,
            'Added gold price entry',
            { type: 'Database' },
            { date: dateStr, price }
        );

        res.status(201).json({ message: `Successfully added price for ${dateStr} to the database.` });
    } catch (error) {
        console.error("Error adding price entry to database:", error);
        res.status(500).json({ message: 'Failed to write to the database.' });
    }
};

// --- THIS IS THE CORRECTED FUNCTION ---
const fetchAndStoreGoldPrice = async () => {
    console.log('Attempting to fetch and store gold price from external source...');
    const scrapedData = await scrapeGoldPrice();

    // The check is now correct: it only looks for a valid 'price' property.
    if (scrapedData && typeof scrapedData.price === 'number' && !isNaN(scrapedData.price)) {
        try {
            // We create TODAY'S date here, as per your instructions.
            const todayString = new Date().toISOString().split('T')[0];
            const latestPrice = scrapedData.price/TROY_OZ_TO_GRAMS;

            // This function saves the price to the database under today's date.
            await savePriceToDb(todayString, latestPrice);
            console.log(`Controller successfully saved price for TODAY (${todayString}): ${latestPrice}`);
        } catch (error) {
            console.error('Error saving scraped gold price to the database:', error.message);
        }
    } else {
        console.log('Could not scrape new gold price data, or data was invalid. No action taken.');
    }
};

module.exports = {
    getSettings,
    updateSettings,
    addGoldPriceEntry,
    fetchAndStoreGoldPrice,
};
