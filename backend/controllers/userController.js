// backend/controllers/userController.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer'); // For error handling in upload
const cloudinary = require('../config/cloudinary'); // For deleting old images
const User = require('../models/User');
// --- Import the updated gamification helpers ---
const { getAllBadges } = require('../config/gamification'); // <-- Keep this for badges
const DynamicChallenge = require('../models/DynamicChallenge'); // <-- NEW: Import DB model
// --- Other services and utilities ---
const { createNotification } = require('../services/notificationService');
const { getGoldMarketSummary } = require('../utils/goldDataUtils');

// Helper Function (Optional but recommended)
const sendErrorResponse = (res, statusCode, message, error) => {
    console.error(`[API Error] ${statusCode}: ${message}`, error || '');
    // Avoid sending detailed errors to client in production
    const responseMessage = process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : message;
    res.status(statusCode).json({ message: responseMessage });
};

// @desc    Get current user's profile (incl. transactions, gamification state, auto payments, default shipping address, profit calculation, profile picture)
// @route   GET /api/users/me
// @access  Private
const getUserProfile = async (req, res) => {
    // 1. Validate Middleware User ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        console.error("[UCP getUserProfile] Invalid user object or ID from 'protect' middleware.");
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;

    try {
        // 2. Fetch User Data
        const user = await User.findById(userId)
            .populate('transactions')       // Populate for calculations & response
            .populate('automaticPayments') // Populate for response
            .select('-password');          // Exclude password

        if (!user) {
            console.error(`[UCP getUserProfile] User ${userId} not found in database.`);
            return res.status(404).json({ message: 'User not found.' });
        }

        // --- Profit calculation logic remains the same ---
        let totalInvestedLKR = 0;
        let totalGramsPurchased = 0;

        (user.transactions || []).forEach(tx => {
            if (tx && tx.type === 'investment' && tx.status === 'completed') {
                totalInvestedLKR += tx.amountLKR || 0;
                totalGramsPurchased += tx.amountGrams || 0;
            }
        });

        const averagePurchasePricePerGram = (totalGramsPurchased > 0)
            ? (totalInvestedLKR / totalGramsPurchased)
            : 0;

        const marketSummary = await getGoldMarketSummary();
        const currentPricePerGram = marketSummary?.latestPricePerGram || 0;

        const currentValueLKR = user.goldBalanceGrams * currentPricePerGram;
        let overallProfitLKR = 0;
        let overallProfitPercent = 0;

        if (averagePurchasePricePerGram > 0 && user.goldBalanceGrams > 0) {
            const costBasisOfCurrentHoldings = user.goldBalanceGrams * averagePurchasePricePerGram;
            overallProfitLKR = currentValueLKR - costBasisOfCurrentHoldings;
            if (costBasisOfCurrentHoldings > 0) {
                overallProfitPercent = (overallProfitLKR / costBasisOfCurrentHoldings) * 100;
            }
        }
        // --- End Profit Calculation ---

        // --- MODIFIED: Get challenges and badges ---
        const activeBadgesDefs = getAllBadges(); // Badges are still static from config

        // Fetch DYNAMIC challenges from the database
        const activeChallengesDefs = await DynamicChallenge.find({
            isActive: true,
            endDate: { $gte: new Date() } // Only show challenges that haven't expired
        }).lean();
        // --- END MODIFIED ---

        const sortedTransactions = (user.transactions || [])
            ?.filter(tx => tx && tx.date)
            ?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [];

        // 5. Send Response
        res.json({
             // Basic Info
             _id: user._id,
             name: user.name,
             email: user.email,
             phone: user.phone,
             address: user.address,
             city: user.city,
             nic: user.nic,
             profilePictureUrl: user.profilePictureUrl || null,
             createdAt: user.createdAt,
             // Wallet Core Data
             goldBalanceGrams: user.goldBalanceGrams,
             cashBalanceLKR: user.cashBalanceLKR,
             transactions: sortedTransactions,
             automaticPayments: user.automaticPayments || [],
             defaultShippingAddress: user.defaultShippingAddress || null,

             // Calculated Values
             averagePurchasePricePerGram: averagePurchasePricePerGram,
             currentGoldValueLKR: currentValueLKR,
             overallProfitLKR: overallProfitLKR,
             overallProfitPercent: overallProfitPercent,

             // Gamification State (from user document)
             earnedBadgeIds: user.earnedBadgeIds || [],
             // --- THIS IS THE FIX ---
             // Convert Map to a plain object before sending it as JSON
             challengeProgress: user.challengeProgress ? Object.fromEntries(user.challengeProgress) : {},
             // --- END OF FIX ---
             completedChallengeIds: user.completedChallengeIds || [],
             starCount: user.starCount || 0,

             // Gamification Definitions (now a mix of static and dynamic)
             gamificationDefs: {
                 badges: activeBadgesDefs || [],
                 challenges: activeChallengesDefs || [] // <-- This now comes from the DB
             }
         });

    } catch (error) {
        // Catch unexpected errors
        sendErrorResponse(res, 500, `Unexpected server error getting user profile for ${userId}.`, error);
    }
};


// @desc    Update user profile (subset of fields)
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  // 1. Validate Middleware User ID
  if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
      return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
  }
  const userId = req.user._id;

  try {
    // 2. Fetch fresh user data from DB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 3. Apply updates only for provided fields
    const { name, phone, address, city, defaultShippingAddress } = req.body;
    let updated = false;

    if (name !== undefined && user.name !== name) { user.name = name; updated = true; }
    if (phone !== undefined && user.phone !== phone) { user.phone = phone; updated = true; }
    if (address !== undefined && user.address !== address) { user.address = address; updated = true; }
    if (city !== undefined && user.city !== city) { user.city = city; updated = true; }
    // Basic check for defaultShippingAddress; add deeper validation if needed
    if (defaultShippingAddress !== undefined && JSON.stringify(user.defaultShippingAddress) !== JSON.stringify(defaultShippingAddress)) {
        // Add validation for required fields in defaultShippingAddress if needed
        user.defaultShippingAddress = defaultShippingAddress;
        updated = true;
    }

    // 4. Save only if changes were made
    let updatedUser = user;
    if (updated) {
        updatedUser = await user.save();
    }

    // 5. Respond with consistent subset of data
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email, // Email usually not updatable here, but good to return
      phone: updatedUser.phone,
      address: updatedUser.address,
      city: updatedUser.city,
      nic: updatedUser.nic, // Include NIC
      defaultShippingAddress: updatedUser.defaultShippingAddress,
      profilePictureUrl: updatedUser.profilePictureUrl || null, // Include profile picture in response
      // Avoid sending back balances/transactions on profile update
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
        sendErrorResponse(res, 400, "Validation Error updating profile.", error);
    } else {
        sendErrorResponse(res, 500, `Server Error updating profile for ${userId}.`, error);
    }
  }
};

// @desc    Change user password (when logged in)
// @route   PUT /api/users/change-password
// @access  Private
const changeUserPassword = async (req, res) => {
    // 1. Validate Middleware User ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;

    const { currentPassword, newPassword } = req.body;
    const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH || '8', 10);

    // 2. Input Validation
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Please provide current and new passwords.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (currentPassword === newPassword) {
        return res.status(400).json({ message: 'New password cannot be the same as the current password.' });
    }

    try {
        // 3. Fetch user including password hash
        const user = await User.findById(userId).select('+password');
        if (!user) {
            // Should not happen if middleware is correct, but safety check
            return res.status(404).json({ message: 'User not found' });
        }

        // 4. Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            // Generic message for security
            return res.status(401).json({ message: 'Authentication failed.' });
        }

        // 5. Update password (pre-save hook in User model handles hashing)
        user.password = newPassword;
        await user.save();

        // 6. Create Notification (after successful save)
        try {
            await createNotification(userId, 'security_password_change', {
                title: 'Password Changed',
                message: 'Your GoldNest account password was successfully changed.',
                // link: '/settings/security' // Optional link
            });
            console.log(`[UCP changePassword] Password change notification created for user ${userId}`);
        } catch (notificationError) {
            console.error(`[UCP ERROR changePassword] Failed notification for user ${userId}:`, notificationError);
            // Log error but don't fail the main request as password change succeeded
        }

        // 7. Respond
        res.json({ message: 'Password changed successfully.' });

    } catch (error) {
        if (error.name === 'ValidationError') {
             sendErrorResponse(res, 400, "Validation Error changing password.", error);
        } else {
             sendErrorResponse(res, 500, `Server Error changing password for ${userId}.`, error);
        }
    }
};

// @desc    Upload or update user profile picture
// @route   POST /api/users/profile-picture
// @access  Private
const uploadProfilePicture = async (req, res) => {
    // 1. Validate Middleware User ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;

    try {
        // 2. Check if file was uploaded by multer
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided.' });
        }

        // 3. Get the URL from Cloudinary (stored in req.file.path by multer-storage-cloudinary)
        const imageUrl = req.file.path;
        console.log(`[UCP uploadProfilePicture] Cloudinary URL for user ${userId}: ${imageUrl}`);

        // 4. Find user
        const user = await User.findById(userId);
        if (!user) {
            // Should not happen if 'protect' middleware works, but safety check
            console.error(`[UCP uploadProfilePicture] User ${userId} not found after successful auth.`);
            // Optionally try to delete the uploaded image if user suddenly not found
            // (consider edge cases and if this is necessary)
            return res.status(404).json({ message: 'User not found.' });
        }

        // 5. Optional: Delete old image from Cloudinary if one exists
        const oldImageUrl = user.profilePictureUrl;
        if (oldImageUrl) {
             try {
                // Extract public_id from the Cloudinary URL.
                const publicIdMatch = oldImageUrl.match(/upload\/(?:v\d+\/)?(.*)\.\w+$/);
                if (publicIdMatch && publicIdMatch[1]) {
                    const publicId = publicIdMatch[1];
                    // Basic check to avoid deleting unrelated files if URL format is unexpected
                    if (publicId.startsWith('goldnest_profile_pics/')) { // Ensure this prefix matches your Cloudinary folder setup
                        console.log(`[UCP uploadProfilePicture] Attempting to delete old Cloudinary image: ${publicId}`);
                        const deletionResult = await cloudinary.uploader.destroy(publicId);
                        console.log(`[UCP uploadProfilePicture] Cloudinary deletion result for ${publicId}:`, deletionResult);
                    } else {
                        console.warn(`[UCP uploadProfilePicture] Skipping deletion - extracted publicId "${publicId}" does not match expected prefix.`);
                    }
                } else {
                     console.warn(`[UCP uploadProfilePicture] Could not extract public_id from old URL: ${oldImageUrl}`);
                }
             } catch (deleteError) {
                  console.error("[UCP ERROR uploadProfilePicture] Failed to delete old Cloudinary image:", deleteError);
                  // Don't block the update if deletion fails, just log it
             }
        }

        // 6. Update user's profilePictureUrl
        user.profilePictureUrl = imageUrl;
        await user.save();
        console.log(`[UCP uploadProfilePicture] User ${userId} profile picture URL updated.`);

        // 7. Respond with success and the new URL
        res.json({
            message: 'Profile picture uploaded successfully.',
            profilePictureUrl: imageUrl,
        });

    } catch (error) {
        console.error('[UCP ERROR uploadProfilePicture] Error:', error);
         // Handle potential Multer errors (like file size limit)
         if (error instanceof multer.MulterError) {
             return res.status(400).json({ message: `File upload error: ${error.message}` });
         }
         // Handle custom file filter error (if defined in multer config)
         if (error.message === 'Only image files are allowed!' || error.message === 'File type not allowed') { // Adapt error message if needed
              return res.status(400).json({ message: error.message });
         }
         // Handle other potential errors (e.g., Cloudinary API errors during deletion - though we try/catch that)
         sendErrorResponse(res, 500, 'Server error during profile picture upload.', error);
    }
};

// @desc    Get user's automatic payment settings
// @route   GET /api/users/autopayments
// @access  Private
const getAutoPayments = async (req, res) => {
    // 1. Validate Middleware User ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        console.error("[UCP getAutoPayments] Invalid user object or ID from 'protect' middleware.");
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;

    try {
        // 2. Fetch only the automaticPayments field for the logged-in user
        console.log(`[UCP Debug getAutoPayments] Fetching autopayments for user ${userId}.`);
        const user = await User.findById(userId).select('automaticPayments');

        if (!user) {
            console.error(`[UCP getAutoPayments] User ${userId} not found in database.`);
            return res.status(404).json({ message: 'User not found' });
        }

        // 3. Return the array (or empty array if none exist)
        res.json(user.automaticPayments || []);

    } catch (error) {
        // 4. Handle Errors
        console.error(`[UCP ERROR getAutoPayments] Error fetching auto payments for user ${userId}:`, error);
        sendErrorResponse(res, 500, `Server Error fetching auto payments for user ${userId}.`, error);
    }
};


// ============================================================
// ============= START: UPDATED addAutoPayment ================
// ============================================================
// @desc    Add a new automatic payment setting
// @route   POST /api/users/autopayments
// @access  Private
const addAutoPayment = async (req, res) => {
    // 1. Validate Middleware User ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;

    const { frequency, amountLKR, dayOfMonth } = req.body; // Get potential dayOfMonth
    const validFrequencies = ['daily', 'weekly', 'monthly'];
    const MIN_AUTOPAY_AMOUNT = Number(process.env.MIN_AUTOPAY_AMOUNT_LKR) || 100;
    const MAX_AUTOPAYMENTS = Number(process.env.MAX_AUTOPAYMENTS_PER_USER) || 5;

    // 2. Input Validation
    if (!frequency || !validFrequencies.includes(frequency)) {
        return res.status(400).json({ message: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}.` });
    }
    const numericAmount = Number(amountLKR);
    if (isNaN(numericAmount) || numericAmount < MIN_AUTOPAY_AMOUNT) {
        return res.status(400).json({ message: `Invalid amount. Must be a number >= Rs. ${MIN_AUTOPAY_AMOUNT}.` });
    }
    const finalAmount = Math.round(numericAmount * 100) / 100; // Round LKR

    try {
        // 3. Fetch fresh user data
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // 4. Check Limit
        if (user.automaticPayments && user.automaticPayments.length >= MAX_AUTOPAYMENTS) {
            return res.status(400).json({ message: `Maximum automatic payments (${MAX_AUTOPAYMENTS}) reached.` });
        }

        // 5. Create new payment object - relies on schema default for isActive: true
        const newPayment = {
            _id: new mongoose.Types.ObjectId(), // Pre-generate ID for finding it later
            frequency,
            amountLKR: finalAmount,
            // isActive: true // REMOVED - Rely on schema default
        };

        // Only add dayOfMonth if frequency is monthly and value is provided & valid
        if (frequency === 'monthly' && dayOfMonth !== undefined && dayOfMonth !== null) {
             const day = parseInt(dayOfMonth, 10);
             if (!isNaN(day) && day >= 1 && day <= 28) { // Limiting to 28 for simplicity across months
                newPayment.dayOfMonth = day;
             } else {
                 console.warn(`[Add AutoPay] Invalid dayOfMonth (${dayOfMonth}) provided for monthly plan for user ${userId}. Ignoring.`);
                 // Optionally return a 400 error here if dayOfMonth is mandatory/invalid for monthly
                 // return res.status(400).json({ message: 'Invalid day of month (must be between 1-28) required for monthly frequency.' });
             }
        } else if (frequency === 'monthly' && (dayOfMonth === undefined || dayOfMonth === null)) {
             console.warn(`[Add AutoPay] Monthly frequency selected but no dayOfMonth provided for user ${userId}. Plan created, but dayOfMonth will be null.`);
             // Or return error if required:
             // return res.status(400).json({ message: 'Day of month (1-28) is required for monthly frequency.' });
        }


        // Ensure array exists (good practice)
        if (!Array.isArray(user.automaticPayments)) {
            user.automaticPayments = [];
        }

        // 6. Add Subdocument
        user.automaticPayments.push(newPayment);

        // 7. Mark Modified (Crucial for array pushes)
        user.markModified('automaticPayments');

        // 8. Save Parent Document
        await user.save();
        console.log(`[UCP addAutoPayment] Added new auto payment for user ${userId}: ID ${newPayment._id}`);

        // 9. Respond with the newly added payment (find it by ID to be safe)
        const addedPayment = user.automaticPayments.find(p => p._id.equals(newPayment._id));
        if (!addedPayment) {
             console.error(`[UCP ERROR addAutoPayment] Could not find added auto payment ${newPayment._id} immediately after save for user ${userId}.`);
             return sendErrorResponse(res, 500, `Server Error finding added auto payment for user ${userId}.`, null);
        }
        res.status(201).json(addedPayment); // Send back the full object including defaults like isActive

    } catch (error) {
        if (error.name === 'ValidationError') {
             sendErrorResponse(res, 400, "Validation Error adding auto payment.", error);
        } else {
             sendErrorResponse(res, 500, `Server Error adding auto payment for user ${userId}.`, error);
        }
    }
};
// ============================================================
// ============== END: UPDATED addAutoPayment =================
// ============================================================


// @desc    Update an existing automatic payment setting
// @route   PUT /api/users/autopayments/:id
// @access  Private
const updateAutoPayment = async (req, res) => {
    const { id: paymentId } = req.params;
    const userId = req.user._id; // Assuming 'protect' middleware adds user to req

    // Validate User ID (added from previous pattern)
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }

    // --- V V V Check what's in the request body V V V ---
    console.log(`[Update AutoPay] Received request for User: ${userId}, Plan: ${paymentId}, Body:`, req.body);
    // --- ^ ^ ^ ---

    // Basic validation for payment ID
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return res.status(400).json({ message: 'Invalid automatic payment ID format.' });
    }

    // --- Refined Input Validation ---
    const updateFields = {};
    let hasUpdate = false;

    // Validate isActive ONLY if it's present in the request body
    if (req.body.hasOwnProperty('isActive')) {
        if (typeof req.body.isActive !== 'boolean') {
            return res.status(400).json({ message: 'Invalid isActive value provided (must be true or false).' });
        }
        updateFields.isActive = req.body.isActive;
        hasUpdate = true;
    }

    // Validate amountLKR ONLY if it's present
    if (req.body.hasOwnProperty('amountLKR')) {
        const MIN_AUTOPAY_AMOUNT = Number(process.env.MIN_AUTOPAY_AMOUNT_LKR) || 100;
        const numericAmount = Number(req.body.amountLKR);
        if (isNaN(numericAmount) || numericAmount < MIN_AUTOPAY_AMOUNT) {
            return res.status(400).json({ message: `Invalid amount. Must be a number >= Rs. ${MIN_AUTOPAY_AMOUNT}.` });
        }
        updateFields.amountLKR = Math.round(numericAmount * 100) / 100; // Round LKR
        hasUpdate = true;
    }

    // Validate frequency ONLY if it's present
    if (req.body.hasOwnProperty('frequency')) {
        const validFrequencies = ['daily', 'weekly', 'monthly'];
        if (!validFrequencies.includes(req.body.frequency)) {
             return res.status(400).json({ message: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}.` });
        }
        updateFields.frequency = req.body.frequency;
        hasUpdate = true;
        // Note: If frequency changes to/from monthly, we might need to handle dayOfMonth update/removal
    }

    // Validate dayOfMonth ONLY if it's present
    if (req.body.hasOwnProperty('dayOfMonth')) {
        // Allow null or a valid number (1-28)
        if (req.body.dayOfMonth === null) {
            updateFields.dayOfMonth = null;
            hasUpdate = true;
        } else {
            const day = parseInt(req.body.dayOfMonth, 10);
             if (!isNaN(day) && day >= 1 && day <= 28) {
                 updateFields.dayOfMonth = day;
                 hasUpdate = true;
             } else {
                 return res.status(400).json({ message: 'Invalid day of month (must be between 1-28 or null).' });
             }
        }
    }

    // Check if any valid field was provided for update
    if (!hasUpdate) {
         return res.status(400).json({ message: 'No valid fields provided for update (accepted: isActive, amountLKR, frequency, dayOfMonth).' });
    }
    // --- End Refined Input Validation ---

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find the specific subdocument using the .id() method
        const payment = user.automaticPayments.id(paymentId);
        if (!payment) {
            return res.status(404).json({ message: 'Automatic payment setting not found.' });
        }

        console.log(`[Update AutoPay] Found Plan ${paymentId}. Current state:`, JSON.stringify(payment.toObject())); // Log current state

        let updated = false; // Flag to track if any actual change occurred

        // Apply updates only if the new value differs from the existing one
        if (updateFields.hasOwnProperty('isActive') && payment.isActive !== updateFields.isActive) {
            console.log(`[Update AutoPay] Toggling isActive for Plan ${paymentId} from ${payment.isActive} to ${updateFields.isActive}`);
            payment.isActive = updateFields.isActive;
            updated = true;
        }

        if (updateFields.hasOwnProperty('amountLKR') && payment.amountLKR !== updateFields.amountLKR) {
             console.log(`[Update AutoPay] Updating amountLKR for Plan ${paymentId} from ${payment.amountLKR} to ${updateFields.amountLKR}`);
             payment.amountLKR = updateFields.amountLKR;
             updated = true;
        }

        if (updateFields.hasOwnProperty('frequency') && payment.frequency !== updateFields.frequency) {
            console.log(`[Update AutoPay] Updating frequency for Plan ${paymentId} from ${payment.frequency} to ${updateFields.frequency}`);
            payment.frequency = updateFields.frequency;
            // If changing FROM monthly, clear dayOfMonth
            if (payment.frequency !== 'monthly') {
                payment.dayOfMonth = null; // Or undefined, depending on schema
            }
            // If changing TO monthly, dayOfMonth might need to be set (but only if provided in updateFields)
             // Optional: Recalculate nextRunDate if frequency changes
             // payment.nextRunDate = calculateNextRunDate(updateFields.frequency);
            updated = true;
        }

        // Apply dayOfMonth update only if frequency is monthly or becoming monthly
        if (updateFields.hasOwnProperty('dayOfMonth') && payment.frequency === 'monthly' && payment.dayOfMonth !== updateFields.dayOfMonth) {
             console.log(`[Update AutoPay] Updating dayOfMonth for Plan ${paymentId} from ${payment.dayOfMonth} to ${updateFields.dayOfMonth}`);
             payment.dayOfMonth = updateFields.dayOfMonth;
             updated = true;
        }
        // Handle case where frequency changed *to* monthly in this request AND dayOfMonth was also provided
        if (updateFields.hasOwnProperty('frequency') && updateFields.frequency === 'monthly' && updateFields.hasOwnProperty('dayOfMonth') && payment.dayOfMonth !== updateFields.dayOfMonth) {
            if (!updated) { // If frequency didn't actually change but dayOfMonth did
                 console.log(`[Update AutoPay] Updating dayOfMonth for Plan ${paymentId} from ${payment.dayOfMonth} to ${updateFields.dayOfMonth}`);
                 payment.dayOfMonth = updateFields.dayOfMonth;
                 updated = true;
            } // else: dayOfMonth was already set when frequency was processed
        }


        // Save Parent Document ONLY if subdocument actually changed value
        if (updated) {
            console.log(`[Update AutoPay] Change detected. Marking 'automaticPayments' as modified for User ${userId}.`);
            // --- Explicitly mark the array as modified ---
            // This is crucial for Mongoose to detect changes within subdocuments reliably.
            user.markModified('automaticPayments');
            // --- ---
            await user.save();
            console.log(`[Update AutoPay] User ${userId} saved successfully after updating Plan ${paymentId}. New state:`, JSON.stringify(payment.toObject())); // Log state after save
        } else {
             console.log(`[Update AutoPay] No actual change in value detected for Plan ${paymentId}. Skipping save.`);
        }

        // Respond with the potentially updated payment object
        res.json(payment); // Send back the subdocument state *after* potential save

    } catch (error) {
        console.error(`[Update AutoPay] Error updating auto payment ${paymentId} for user ${userId}:`, error);
        if (error.name === 'ValidationError') {
            // Extract specific validation errors if possible
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: "Validation Error updating auto payment.", errors: messages });
        }
        // Use the helper function for consistency or send generic message
        sendErrorResponse(res, 500, `Server Error updating auto payment ${paymentId} for user ${userId}.`, error);
        // res.status(500).json({ message: `Server Error updating auto payment` }); // Alternative generic response
    }
};


// @desc    Delete an automatic payment setting
// @route   DELETE /api/users/autopayments/:id
// @access  Private
const deleteAutoPayment = async (req, res) => {
    // 1. Validate Middleware User ID & Payment ID
    if (!req.user || !req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
        return res.status(401).json({ message: 'Authentication error: Invalid user data.' });
    }
    const userId = req.user._id;
    const { id: paymentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return res.status(400).json({ message: 'Invalid automatic payment ID format.' });
    }

    try {
        // 2. Fetch fresh user data
        // Note: Populate is not strictly needed for removal by pull, but harmless
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // 3. Find the subdocument (optional, for checking existence first)
        const paymentExists = user.automaticPayments.id(paymentId);
        if (!paymentExists) {
            // Already deleted or never existed - return 404.
            return res.status(404).json({ message: 'Automatic payment setting not found.' });
        }

        // 4. Remove the subdocument using 'pull'
        user.automaticPayments.pull({ _id: paymentId }); // Mongoose pull operator
        console.log(`[UCP deleteAutoPayment] Prepared removal of auto payment ${paymentId} for user ${userId}`);

        // 5. Mark Modified (Important for array pulls too)
        user.markModified('automaticPayments');

        // 6. Save Parent Document to persist the removal
        await user.save();
        console.log(`[UCP deleteAutoPayment] Auto payment ${paymentId} deletion saved successfully for user ${userId}`);

        // 7. Respond
        res.json({ message: 'Automatic payment deleted successfully.', deletedId: paymentId });

    } catch (error) {
         console.error(`[UCP ERROR deleteAutoPayment] Error deleting payment ${paymentId} for user ${userId}:`, error);
         sendErrorResponse(res, 500, `Server Error deleting auto payment ${paymentId} for user ${userId}.`, error);
    }
};

// Export all controller functions
module.exports = {
    getUserProfile,
    updateUserProfile,
    changeUserPassword,
    uploadProfilePicture,
    getAutoPayments,
    addAutoPayment, // Ensure the updated function is exported
    updateAutoPayment,
    deleteAutoPayment,
};