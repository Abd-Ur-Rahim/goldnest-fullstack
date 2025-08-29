// backend/server.js

// Load environment variables from .env file
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables

// Import necessary packages
const express = require('express');
const cors = require('cors');

// Import DB connection
const connectDB = require('./config/db');

// Import route files
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const aiRoutes = require('./routes/aiRoutes');
const gamificationRoutes = require('./routes/gamificationRoutes');
const marketRoutes = require('./routes/marketRoutes');
const walletRoutes = require('./routes/walletRoutes');     // Import wallet routes
const sellRoutes = require('./routes/sellRoutes');         // Import sell routes
const redemptionRoutes = require('./routes/redemptionRoutes'); // ADDED: Import redemption routes
const notificationRoutes = require('./routes/notificationRoutes'); // Import notification routes
const userPreferenceRoutes = require('./routes/userPreferenceRoutes'); // Import user preference routes
const priceAlertRoutes = require('./routes/priceAlertRoutes'); // Import price alert routes
const adminAuthRoutes = require('./routes/adminAuthRoutes'); // <-- ADD THIS
const adminRoutes = require('./routes/adminRoutes'); // <-- ADD THIS
const adminSettingsRoutes = require('./routes/adminSettingsRoutes'); // <-- ADD
const adminGamificationRoutes = require('./routes/adminGamificationRoutes'); // <-- ADD
const adminPromoRoutes = require('./routes/adminPromoRoutes'); // <-- ADD
const adminInventoryRoutes = require('./routes/adminInventoryRoutes'); // <-- ADD
const promoRoutes = require('./routes/promoRoutes'); // <-- ADD
const adminManagementRoutes = require('./routes/adminManagementRoutes');

// Connect to Database
connectDB();

// Initialize and start cron jobs (e.g., for price alerts, notifications)
// This line executes the code in scheduler.js, setting up any defined cron jobs
require('./scheduler'); // <-- Existing line

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust later for security)
app.use(express.json()); // Allow the server to accept JSON data in request bodies

const allowedOrigins = [
  'http://localhost:3000', // Your local frontend for development
   `${process.env.FRONTEND_URL}`// Your deployed Vercel frontend URL
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
};

// Use the configured CORS options
app.use(cors(corsOptions));

app.use(express.json()); 
// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users/preferences', userPreferenceRoutes); // Mount user preferences under /users
app.use('/api/users/price-alerts', priceAlertRoutes); // Mount price alerts under /users
app.use('/api/investments', investmentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/wallet', walletRoutes);         // Mount wallet routes
app.use('/api/sell', sellRoutes);             // Mount sell routes
// app.use('/api/redeem', redeemRoutes);         // REMOVED old redeem routes mount
app.use('/api/redemptions', redemptionRoutes);  // ADDED: Mount redemption routes
app.use('/api/notifications', notificationRoutes); // Mount notification routes
app.use('/api/admin/auth', adminAuthRoutes); // <-- ADD THIS
app.use('/api/admin', adminRoutes); // <-- ADD THIS
app.use('/api/admin/settings', adminSettingsRoutes); // <-- ADD
app.use('/api/admin/gamification', adminGamificationRoutes); // <-- ADD
app.use('/api/admin/promos', adminPromoRoutes); // <-- ADD
app.use('/api/admin/inventory', adminInventoryRoutes); // <-- ADD
app.use('/api/promos', promoRoutes); // <-- ADD
app.use('/api/admin/management', adminManagementRoutes);

// Basic test route
app.get('/', (req, res) => {
  res.send('GoldNest Backend API is running!');
});

// Define the port the server will run on
const PORT = process.env.PORT || 5001;

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});