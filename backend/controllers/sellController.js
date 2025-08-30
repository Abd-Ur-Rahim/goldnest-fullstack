// backend/controllers/sellController.js
const User = require('../models/User');
const { getGoldMarketSummary } = require('../utils/goldDataUtils'); // Need current price
const { calculateSellFee } = require('../utils/feeUtils'); // Import sell fee calculator
const { createNotification } = require('../services/notificationService'); // Added for notifications
const { updateGamificationOnAction } = require('../services/gamificationTriggerService'); // Added for gamification
const { transferFromUserToTreasury } = require('../services/blockchainService'); // <-- NEW IMPORT

// Helper function for formatting currency (can be moved to a utils file if used elsewhere)
const formatCurrency = (value) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value);

// @desc    Sell user's gold
// @route   POST /api/sell/gold
// @access  Private
const sellGold = async (req, res) => {
    const { amountGrams } = req.body; // User specifies how many grams to sell
    const userId = req.user._id;

    // Validation
    if (!amountGrams || isNaN(amountGrams) || Number(amountGrams) <= 0) {
        return res.status(400).json({ message: 'Invalid amount of grams to sell.' });
    }
    // Add minimum sell amount if desired (e.g., 0.001 grams)
    const requiredGrams = Number(amountGrams); // Use this consistent variable
    if (requiredGrams < 0.001) {
        return res.status(400).json({ message: 'Minimum sell amount is 0.001 grams.' });
    }

    try {
        // --- Get Current Gold Price ---
        const marketSummary = await getGoldMarketSummary(); // In a real app, fetch this dynamically if needed
        // Assuming this holds the *selling* price (bid price) the platform offers
        const currentPricePerGram = marketSummary.latestPricePerGram; // TODO: Distinguish between buy/sell price if needed

        if (!currentPricePerGram || currentPricePerGram <= 0) {
            console.error("Could not determine current gold selling price from market summary:", marketSummary);
            return res.status(500).json({ message: 'Could not determine current gold selling price. Please try again later.' });
        }

        // --- Get User ---
        // We fetch the full user object once, which should include the private key
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // --- Check Sufficient Gold Balance ---
        // Use a small tolerance for floating point comparisons if necessary
        const tolerance = 1e-9; // Small tolerance for floating point precision issues
        if (user.goldBalanceGrams < requiredGrams - tolerance) {
            return res.status(400).json({ message: `Insufficient gold balance. You have ${user.goldBalanceGrams.toFixed(4)}g, but tried to sell ${requiredGrams.toFixed(4)}g.` });
        }

        // --- Calculation ---
        const grossProceedsLKR = requiredGrams * currentPricePerGram;
        const sellFeeLKR = await calculateSellFee(grossProceedsLKR); // Calculate the fee based on gross proceeds
        const netProceedsLKR = grossProceedsLKR - sellFeeLKR;   // Net amount user receives

        // Ensure net proceeds are not negative (although unlikely with positive prices/fees)
        if (netProceedsLKR < 0) {
             console.error(`Calculated negative net proceeds (${netProceedsLKR}) for sell of ${requiredGrams}g. Gross: ${grossProceedsLKR}, Fee: ${sellFeeLKR}`);
             return res.status(500).json({ message: 'Calculation error resulted in negative proceeds. Please contact support.' });
        }

        // --- Prepare Transaction Record ---
        const transactionData = {
            type: 'sell_gold',
            amountGrams: requiredGrams, // Record grams sold
            amountLKR: netProceedsLKR, // Record NET LKR received by the user
            pricePerGram: currentPricePerGram, // Store the price used for this transaction
            feeLKR: sellFeeLKR, // Store the calculated fee
            description: `Sold ${requiredGrams.toFixed(4)}g gold @ ~${currentPricePerGram.toFixed(0)} LKR/g. Received ${formatCurrency(netProceedsLKR)} (after ${formatCurrency(sellFeeLKR)} fee)`,
            status: 'completed' // Selling is usually instant
        };

        // --- NEW: Blockchain Transfer Back to Treasury ---
        try {
            // We use the user object fetched earlier for the private key
            const userPrivateKey = user.blockchainPrivateKey;

            if (userPrivateKey && requiredGrams > 0) {
                const txHash = await transferFromUserToTreasury(userPrivateKey, requiredGrams);
                // Save the hash to the new transaction record
                transactionData.blockchainTxHash = txHash;
            }
        } catch (blockchainError) {
            console.error(`[Blockchain] CRITICAL: Sell processed in DB but token transfer FROM USER failed for user ${userId}. Needs manual reconciliation.`, blockchainError);
            // The process continues to ensure the user's DB state is correct.
            // A reconciliation service should monitor for transactions missing a hash.
        }
        // --- END NEW ---

        // --- Update Balances and Save ---
        // Ensure gold balance doesn't go negative due to floating point math
        user.goldBalanceGrams = Math.max(0, user.goldBalanceGrams - requiredGrams);
        user.cashBalanceLKR += netProceedsLKR; // Add NET proceeds to cash wallet
        user.transactions.push(transactionData);

        const updatedUser = await user.save();

        // Get the newly created transaction (it's the last one in the array)
        // Mongoose adds _id automatically to subdocuments when saved.
        const newTransaction = updatedUser.transactions[updatedUser.transactions.length - 1];

        // --- Create notification ---
        // Do this after successful save, but handle potential errors gracefully
        try {
            await createNotification(userId, 'transaction_sell', {
                title: 'Sale Successful',
                // Use the net amount (amountLKR from the transaction) in the notification
                message: `You successfully sold ${newTransaction.amountGrams.toFixed(4)}g of gold for ${formatCurrency(newTransaction.amountLKR)} (after fees). Funds added to wallet.`,
                link: '/wallet', // Or perhaps '/transactions' or a specific transaction detail page
                metadata: { transactionId: newTransaction._id } // Pass the ID of the saved transaction
            });
        } catch (notificationError) {
            // Log the notification error, but don't fail the main request
            console.error(`Failed to create notification for user ${userId} after successful gold sale:`, notificationError);
            // Optionally, queue this notification for retry later
        }

        // --- Trigger Gamification Update ---
        // Also run this after successful save. Run asynchronously and log errors without failing the request.
        updateGamificationOnAction(userId, 'sell', {
            amountGrams: newTransaction.amountGrams, // Pass relevant data for gamification logic
            netProceedsLKR: newTransaction.amountLKR // Pass net proceeds if needed by gamification
        }).catch(gamError => console.error(`Gamification update failed after sell for user ${userId}:`, gamError));


        // --- Success Response ---
        // Send the response immediately after saving and initiating async tasks (notification, gamification)
        res.status(200).json({
            message: `Successfully sold ${requiredGrams.toFixed(4)}g of gold. ${formatCurrency(netProceedsLKR)} added to wallet after ${formatCurrency(sellFeeLKR)} fee.`,
            newGoldBalanceGrams: updatedUser.goldBalanceGrams,
            newCashBalanceLKR: updatedUser.cashBalanceLKR,
            transaction: newTransaction // Send back the details of the transaction just created
        });

    } catch (error) {
        console.error("Error during gold sell:", error);
        // More specific error handling can be added here (e.g., validation errors from Mongoose)
        if (error.name === 'ValidationError') {
             return res.status(400).json({ message: "Validation Error", details: error.message });
        }
        res.status(500).json({ message: 'Server Error during gold sell process.' });
    }
};

module.exports = { sellGold };

/*
Notes on Atomicity:
In a high-concurrency production environment, the sequence of:
1. Check balance
2. Calculate proceeds & fee
3. Update balance
4. Save user
needs to be atomic to prevent race conditions (e.g., two sell requests processing simultaneously using the same initial balance).
Strategies:
a) Pessimistic Locking: Lock the user document before reading/writing. (e.g., using `findByIdAndUpdate` with specific options or transaction locks).
b) Optimistic Locking: Use Mongoose's versioning (`__v` field) to detect concurrent modifications and retry if necessary. Mongoose does this implicitly if you fetch then save, but explicit checks might be needed for retries.
c) Database Transactions: If using a database that supports transactions (like MongoDB replica sets/sharded clusters starting v4.0), wrap the find, update, and save operations within a transaction. This is generally the most robust approach.
The current code relies on Mongoose's implicit versioning during the `save()` but doesn't implement explicit retries or database transactions, assuming lower concurrency for simplicity.
*/