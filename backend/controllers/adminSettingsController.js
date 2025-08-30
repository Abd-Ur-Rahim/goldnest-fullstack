// backend/controllers/adminSettingsController.js
const Setting = require('../models/Setting'); // <-- The single, correct import
const { savePriceToDb } = require('../utils/goldDataUtils'); 
const { invalidateFeeCache } = require('../utils/feeUtils');
const { logAdminAction } = require('../services/auditLogService');
// A helper to get all settings at once
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
// --- UPDATED to include UNDO logging ---
const updateSettings = async (req, res) => {
// We remove confirmationPassword from the object so it's not saved as a setting
const { confirmationPassword, ...settingsToUpdate } = req.body;
    try {
    // Fetch the old settings values BEFORE updating, for the undo log
        const keysToUpdate = Object.keys(settingsToUpdate);
        const oldSettings = await Setting.find({ key: { $in: keysToUpdate } });
        const undoData = oldSettings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        // Perform the updates
        const updatePromises = Object.entries(settingsToUpdate).map(([key, value]) => {
        const parsedValue = !isNaN(parseFloat(value)) ? parseFloat(value) : value;
            return Setting.findOneAndUpdate(
                { key },
                { value: parsedValue },
                { upsert: true, new: true }
            );
        });
        await Promise.all(updatePromises);

        // Log the admin action, now including the old values in undoData
        await logAdminAction(
            req.admin, 
            'Updated platform settings', 
            { type: 'Setting' }, 
            { updatedKeys: keysToUpdate },
            undoData // <-- Pass the old values for the undo feature
        );

        invalidateFeeCache();
        res.json({ message: 'Settings updated successfully.' });

    } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ message: "Error updating settings." });
    }
};
// --- UPDATED to include audit logging ---
const addGoldPriceEntry = async (req, res) => {
    const { date, price } = req.body;
    if (!date || !price || isNaN(parseFloat(price))) {
        return res.status(400).json({ message: 'Please provide a valid date and price.' });
    }

    try {
        const dateStr = new Date(date).toISOString().split('T')[0];
        
        // <-- FIX: Changed appendPriceToCsv to the correct function, savePriceToDb
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
}
module.exports = {
getSettings,
updateSettings,
addGoldPriceEntry,
};