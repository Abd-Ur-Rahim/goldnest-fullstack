// backend/controllers/investmentController.js
const mongoose = require('mongoose'); // Needed for ObjectId generation and DB interaction
const User = require('../models/User');
const { getGoldMarketSummary } = require('../utils/goldDataUtils');
const { updateGamificationOnAction } = require('../services/gamificationTriggerService');
const { createNotification } = require('../services/notificationService');
const { calculateBuyFee } = require('../utils/feeUtils'); // Import the base fee calculation function
const { transferToUser } = require('../services/blockchainService'); // <-- CHANGE IMPORT

// Helper function for formatting currency
const formatCurrency = (value) => {
    // Basic fallback if Intl is not fully supported or for zero values
    if (typeof value !== 'number' || isNaN(value)) {
        return 'LKR 0.00';
    }
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value);
};

// @desc    Make a new investment (and optionally set up auto-invest)
// @route   POST /api/investments/invest
// @access  Private (Requires authentication)
const makeInvestment = async (req, res) => {
    // --- V V V START OF INVESTMENT PROCESS V V V ---
    try {
        // --- MODIFIED: Add paymentSource to destructuring ---
        const { amountLKR, saveAsAuto, frequency, dayOfMonth, paymentSource } = req.body;
        const userId = req.user._id; // Get user ID from protect middleware

        // --- V V V ADDED LOGGING V V V ---
        console.log(`[InvestCtrl] Received request body:`, req.body);
        // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---

        // --- Basic Investment Validation ---
        const investmentAmount = Number(amountLKR); // Ensure it's a number
        if (isNaN(investmentAmount) || investmentAmount < 100) { // Min investment check
            return res.status(400).json({ message: 'Invalid investment amount. Minimum is LKR 100.' });
        }

        // --- V V V Auto-Invest Input Validation (if saveAsAuto is true) V V V ---
        // --- V V V ADDED LOGGING V V V ---
        console.log(`[InvestCtrl] Checking saveAsAuto: Value=${saveAsAuto}, Type=${typeof saveAsAuto}`); // Log value and type
        // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
        if (saveAsAuto === true) { // Explicitly check boolean true
            // --- V V V ADDED LOGGING V V V ---
            console.log(`[InvestCtrl] saveAsAuto is true. Validating frequency/dayOfMonth...`); // Check if inside this block
            // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
            if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency)) {
                return res.status(400).json({ message: 'Invalid frequency selected for automatic payment.' });
            }
            // NEW: Validate dayOfMonth if frequency is 'monthly'
            if (frequency === 'monthly') {
                 const day = parseInt(dayOfMonth, 10);
                 if (isNaN(day) || day < 1 || day > 28) { // Validate day is between 1 and 28
                    return res.status(400).json({ message: 'Invalid day of month (1-28) provided for monthly auto-investment.' });
                 }
            }
        } else {
             // --- V V V ADDED LOGGING V V V ---
             console.log(`[InvestCtrl] saveAsAuto is NOT true or not present.`); // Check if this logs instead
             // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
        }
        // --- ^ ^ ^ END Auto-Invest Validation ^ ^ ^ ---


        // --- Get current user data (including challengeProgress for discount) and market price ---
        const user = await User.findById(userId); // Fetch the user WITH challengeProgress
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const marketSummary = await getGoldMarketSummary(); // Assuming sync or handles its own async
        if (!marketSummary || !marketSummary.latestPricePerGram || marketSummary.latestPricePerGram <= 0) {
            console.error("Investment Error: Could not fetch valid market price.");
            return res.status(500).json({ message: 'Could not fetch current gold market price. Please try again later.' });
        }
        const pricePerGram = marketSummary.latestPricePerGram;

        // --- Calculate Base Fee ---
        let feeLKR = await calculateBuyFee(investmentAmount); // <-- ADDED AWAIT
        let appliedDiscountPercent = 0; // Track if a discount was applied
        let appliedDiscountChallengeId = null; // Track which challenge provided the discount
        let discountApplied = false; // Flag to easily check if discount logic was successful

        // --- V V V APPLY FEE DISCOUNT LOGIC V V V ---
        let bestDiscount = 0;
        let discountChallengeIdToApply = null;

        // Check if challengeProgress exists and is a Map
        if (user.challengeProgress && user.challengeProgress instanceof Map) {
            // Iterate through the user's challenge progress map
            for (const [key, value] of user.challengeProgress.entries()) {
                // Check for unclaimed discount flags (e.g., 'CHALLENGEID_discount_applied': false)
                if (key.endsWith('_discount_applied') && value === false) {
                     const challengeId = key.replace('_discount_applied', '');
                     const discountPercentKey = `${challengeId}_discount_percent`;
                     const discountPercentValue = user.challengeProgress.get(discountPercentKey);

                     // If a discount % exists for this challenge and it's better than current best
                     if (typeof discountPercentValue === 'number' && discountPercentValue > bestDiscount) {
                         bestDiscount = discountPercentValue; // Store the percentage value (e.g., 0.1 for 10%)
                         discountChallengeIdToApply = challengeId;
                     }
                }
            }
        }

        // If a usable discount was found, apply it
        if (discountChallengeIdToApply && bestDiscount > 0) {
             const originalFee = feeLKR; // Keep original fee for logging/reference
             appliedDiscountPercent = bestDiscount; // Store the applied discount rate (e.g., 0.1)
             appliedDiscountChallengeId = discountChallengeIdToApply; // Store for marking as used
             const discountAmount = feeLKR * appliedDiscountPercent; // Calculate the discount value
             feeLKR -= discountAmount; // Reduce the fee
             feeLKR = Math.max(0, feeLKR); // Ensure fee doesn't go below zero
             discountApplied = true; // Set flag

             console.log(`Applied ${appliedDiscountPercent * 100}% discount from challenge ${appliedDiscountChallengeId}. Original fee: ${formatCurrency(originalFee)}, New fee: ${formatCurrency(feeLKR)}`);

             // --- Mark the discount as applied in user's progress map ---
             user.challengeProgress.set(`${appliedDiscountChallengeId}_discount_applied`, true);
             // Note: MarkModified('challengeProgress') will be called before save
        }
        // --- ^ ^ ^ END APPLY FEE DISCOUNT LOGIC ^ ^ ^ ---

        // --- Calculate Total Cost (Investment + potentially discounted Fee) ---
        const totalCostLKR = investmentAmount + feeLKR;

        // --- NEW CORE LOGIC: Check Payment Source ---
        if (paymentSource === 'wallet') {
            // This is a purchase using the user's GoldNest wallet
            if (user.cashBalanceLKR < totalCostLKR) {
                const feeMessage = appliedDiscountPercent > 0
                    ? `${formatCurrency(feeLKR)} (after ${appliedDiscountPercent * 100}% discount)`
                    : formatCurrency(feeLKR);
                return res.status(400).json({
                    message: `Insufficient wallet funds. Required: ${formatCurrency(totalCostLKR)} (Investment: ${formatCurrency(investmentAmount)} + Fee: ${feeMessage}), Available: ${formatCurrency(user.cashBalanceLKR)}`
                });
            }
            // Deduct from wallet balance
            user.cashBalanceLKR -= totalCostLKR;
        } else {
            // This is a "direct purchase" via Card/Bank.
            // We do NOT deduct from the user's wallet balance.
            // The funds are assumed to be handled by the payment gateway.
            console.log(`[InvestCtrl] Processing direct purchase for user ${userId}. Wallet balance will not be deducted.`);
        }
        // --- END NEW CORE LOGIC ---

        // --- Calculate gold amount purchased ---
        const amountGrams = parseFloat((investmentAmount / pricePerGram).toFixed(8));

        // --- Update User Balances ---
        // Gold balance is updated for both payment sources
        user.goldBalanceGrams += amountGrams;

        // --- Create Transaction Record (add payment source for clarity) ---
        // OLD //let description = `Invested ${formatCurrency(investmentAmount)} for ${amountGrams.toFixed(4)}g gold via ${paymentSource === 'wallet' ? 'Wallet Cash' : 'Card/Bank'}`;

        // --- NEW, IMPROVED DESCRIPTION LOGIC ---
        let paymentMethodText = 'Wallet Cash';
        if (paymentSource === 'direct') {
            paymentMethodText = 'Card / Bank';
        }
        let description = `Invested ${formatCurrency(investmentAmount)} for ${amountGrams.toFixed(4)}g gold via ${paymentMethodText}`;
        // --- END IMPROVEMENT ---

        if (appliedDiscountPercent > 0) { // Append discount info to description
            description += ` - Discount Applied: ${appliedDiscountPercent * 100}%`;
        }
        const transaction = {
            _id: new mongoose.Types.ObjectId(), // Generate unique ID for the transaction
            type: 'investment',
            amountLKR: investmentAmount, // The amount invested in gold
            amountGrams: amountGrams,
            feeLKR: feeLKR, // Store the potentially discounted fee
            pricePerGramLKR: pricePerGram, // Store the rate used
            paymentSource: paymentSource || 'direct', // Default to 'direct' if not provided
            timestamp: new Date(), // Store the time of the transaction
            description: description, // Use the updated description
            status: 'completed' // Assume instant completion for simulation
        };
        user.transactions.push(transaction);

        // --- V V V Add Auto-Invest Plan if requested V V V ---
        let autoInvestMessage = ''; // Message for response
        let autoPaymentAdded = false; // Flag to know if we need to markModified
        // Use the same strict check here
        if (saveAsAuto === true) {
            // --- V V V ADDED LOGGING V V V ---
            console.log(`[InvestCtrl] Inside 'Add Auto-Invest Plan' block.`); // Check if execution reaches here
            // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---

            // NEW: Optional: Check maximum number of plans
            const MAX_AUTOPAYMENTS = Number(process.env.MAX_AUTOPAYMENTS_PER_USER) || 5; // Example limit from env or default 5
            if (user.automaticPayments && user.automaticPayments.length >= MAX_AUTOPAYMENTS) {
                console.warn(`User ${userId} reached max auto-payments (${MAX_AUTOPAYMENTS}). Investment made, but auto-plan not saved.`);
                autoInvestMessage = ` Automatic payment not saved: Maximum plans reached.`;
                // Investment still proceeds, but auto-plan is not added.
            } else {
                // Create the new auto-payment object
                const newAutoPayment = {
                    _id: new mongoose.Types.ObjectId(), // Give it a unique ID
                    frequency: frequency,
                    amountLKR: investmentAmount, // Amount to be invested each time
                    createdAt: new Date(),
                    isActive: true, // Assume active by default
                };
                // NEW: Add dayOfMonth only if frequency is monthly
                if (frequency === 'monthly') {
                    newAutoPayment.dayOfMonth = Number(dayOfMonth); // Ensure it's stored as a number
                }

                // Ensure automaticPayments array exists
                if (!Array.isArray(user.automaticPayments)) {
                    user.automaticPayments = [];
                }
                // Add the new plan
                user.automaticPayments.push(newAutoPayment);
                autoPaymentAdded = true; // Set flag: we added a plan

                // --- V V V ADDED LOGGING V V V ---
                console.log(`[InvestCtrl] Pushed new auto payment object:`, newAutoPayment); // Log the object being pushed
                // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---

                // Original console log (can be kept or removed if the above is sufficient)
                console.log(`[InvestCtrl] Added auto-payment for user ${userId}: ${frequency}, ${formatCurrency(investmentAmount)} LKR${frequency === 'monthly' ? ` on day ${dayOfMonth}` : ''}`);
                autoInvestMessage = ` Automatic ${frequency} investment for ${formatCurrency(investmentAmount)} was set up.`;
            }
        } else {
            // --- V V V ADDED LOGGING V V V ---
            console.log(`[InvestCtrl] Skipping 'Add Auto-Invest Plan' block because saveAsAuto was not true.`); // Log if skipped
            // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
        }
        // --- ^ ^ ^ END Add Auto-Invest Plan ^ ^ ^ ---

        // --- Mark Modified Paths for Mongoose ---
        user.markModified('transactions'); // Always mark transactions as modified
        if (autoPaymentAdded) {
            // --- V V V ADDED LOGGING V V V ---
            console.log("[InvestCtrl] Marking 'automaticPayments' as modified.");
            // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
            user.markModified('automaticPayments'); // Mark automaticPayments only if one was actually added
        } else {
            // --- V V V ADDED LOGGING V V V ---
             console.log("[InvestCtrl] Not marking 'automaticPayments' as modified.");
            // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
        }
        if (discountApplied) {
            user.markModified('challengeProgress'); // Mark challengeProgress if a discount was used
        }

        // --- Save User (saves balance, transaction, potentially auto-payment, AND potentially applied discount flag) ---
        // --- V V V ADDED LOGGING V V V ---
        console.log("[InvestCtrl] Attempting user.save()...");
        // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---
        const updatedUser = await user.save(); // Save all changes
        // --- V V V ADDED LOGGING V V V ---
        console.log("[InvestCtrl] user.save() completed.");
        // --- ^ ^ ^ END ADDED LOGGING ^ ^ ^ ---

        // --- Find the Saved Transaction (using ID for reliability) ---
        // Use the ID from the transaction object we created earlier
        const savedTransaction = updatedUser.transactions.find(t => t._id.equals(transaction._id));

        // --- Trigger Post-Action Services (Gamification, Notifications) ---
         if (savedTransaction) {
            // --- Blockchain Transfer --- //
            try {
                const userBlockchainAddress = updatedUser.blockchainAddress;
                const gramsPurchased = savedTransaction.amountGrams;
        
                if (userBlockchainAddress && gramsPurchased > 0) {
                    console.log(`[Blockchain] Triggering TRANSFER for user ${updatedUser._id}`);
                    // --- MODIFIED: Call transferToUser instead of mintTokens ---
                    const txHash = await transferToUser(userBlockchainAddress, gramsPurchased);
                    
                    // Find the transaction again and save the hash
                    const userToUpdate = await User.findById(userId);
                    const txToUpdate = userToUpdate.transactions.id(savedTransaction._id);
                    if (txToUpdate) {
                        txToUpdate.blockchainTxHash = txHash;
                        await userToUpdate.save();
                        console.log(`[Blockchain] Saved TxHash ${txHash} to transaction ${txToUpdate._id}`);
                    }
                }
            } catch (blockchainError) {
                console.error(`[Blockchain] CRITICAL: Failed to TRANSFER tokens for transaction ${savedTransaction._id} but DB was updated. Needs manual reconciliation.`, blockchainError);
                // In a real app, you would add this failed transaction to a retry queue.
            }

            // --- Existing Gamification & Notification Logic ---
             try {
                // Pass investment amount (excluding fee), grams, and fee for gamification rules
                await updateGamificationOnAction(userId, 'investment', {
                    amountLKR: savedTransaction.amountLKR,
                    amountGrams: savedTransaction.amountGrams,
                    feeLKR: savedTransaction.feeLKR, // Pass potentially discounted fee
                    discountApplied: appliedDiscountPercent > 0 // Pass flag if discount used
                });
             } catch (gamificationError) {
                 console.error(`[Gamification ERROR] User ${userId} investment: ${gamificationError.message}`);
                 // Log error but don't fail the whole transaction
             }
             try {
                 // Modify notification message based on discount and auto-invest status
                 let notifyMsg = `You invested ${formatCurrency(savedTransaction.amountLKR)} (+ ${formatCurrency(savedTransaction.feeLKR)} fee) and received ${savedTransaction.amountGrams.toFixed(4)}g of gold. Total cost ${formatCurrency(totalCostLKR)}.`;
                 if (appliedDiscountPercent > 0) {
                      notifyMsg += ` A ${appliedDiscountPercent * 100}% fee discount was applied!`;
                 }
                 // Append auto-invest message (if any)
                 if (autoInvestMessage) {
                     notifyMsg += autoInvestMessage; // Add the result of the auto-invest setup attempt
                 }

                 await createNotification(userId, 'transaction_buy', {
                     title: 'Investment Successful',
                     message: notifyMsg, // Use the combined message
                     link: '/wallet', // Link to wallet history page
                     metadata: {
                         transactionId: savedTransaction._id.toString(), // Ensure ID is string
                         amountLKR: savedTransaction.amountLKR,
                         amountGrams: savedTransaction.amountGrams,
                         feeLKR: savedTransaction.feeLKR,
                         discountAppliedPercent: appliedDiscountPercent, // Store discount info if needed
                         autoInvestStatus: autoInvestMessage // Include auto-invest status message if needed
                     }
                 });
             } catch (notificationError) {
                 console.error(`[Notification ERROR] User ${userId} investment: ${notificationError.message}`);
             }
         } else {
            console.error(`CRITICAL: Could not find saved transaction ${transaction._id} for user ${userId} after investment.`);
         }


        // --- Send Success Response ---
        // Construct the main success message, including discount info and auto-invest setup info
        let successMessage = `Investment successful! You acquired ${amountGrams.toFixed(4)}g of gold`;
        if (appliedDiscountPercent > 0) {
            successMessage += ` with a ${appliedDiscountPercent * 100}% fee discount`;
        }
        successMessage += `.${autoInvestMessage}`; // Append the auto-invest message

        res.status(200).json({
            message: successMessage.trim(), // Trim any potential leading/trailing whitespace
            newCashBalanceLKR: updatedUser.cashBalanceLKR,
            newGoldBalanceGrams: updatedUser.goldBalanceGrams,
            transaction: savedTransaction || null, // Return the newly added transaction (or null if not found)
            updatedUserInfo: { // Send back relevant parts for frontend update
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                cashBalanceLKR: updatedUser.cashBalanceLKR,
                goldBalanceGrams: updatedUser.goldBalanceGrams,
                transactions: updatedUser.transactions, // Send updated transactions array
                automaticPayments: updatedUser.automaticPayments, // Send updated auto-payments array
                // Include gamification fields, especially the updated challengeProgress
                earnedBadgeIds: updatedUser.earnedBadgeIds,
                // Convert Map to object for JSON serialization if it exists
                challengeProgress: updatedUser.challengeProgress instanceof Map ? Object.fromEntries(updatedUser.challengeProgress) : updatedUser.challengeProgress || {},
                completedChallengeIds: updatedUser.completedChallengeIds,
                starCount: updatedUser.starCount
            }
        });

    // --- V V V CATCH BLOCK FOR ERROR HANDLING V V V ---
    } catch (error) {
        console.error('[InvestCtrl] Investment processing error:', error); // Log the full error
        // Check for specific Mongoose validation errors if needed
        if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation failed', errors: error.errors });
        }
        // Generic server error
        res.status(500).json({ message: 'Server error during investment processing. Please try again.' });
    }
};


// Export the controller function
module.exports = { makeInvestment };