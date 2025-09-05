// backend/services/aiSuggestionService.js
const Groq = require("groq-sdk");
const { getRecentGoldData, getGoldMarketSummary } = require('../utils/goldDataUtils'); // <-- Add getGoldMarketSummary

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Helper function to format data for the prompt
function formatDataForPrompt(data) {
    if (!Array.isArray(data) || data.length === 0) return "No recent data available.";
    return data.map(d => `${d.DateStr}: ${d.LKR_per_Oz.toFixed(2)} LKR/Oz`).join('\n');
}

// --- Helper Function to Summarize User Data ---
function summarizeUserData(user) {
    if (!user) return "User data not available.";

    const balance = user.goldBalanceGrams?.toFixed(3) || '0.000';
    const transactions = user.transactions || [];
    const lastInvestment = transactions.filter(t => t.type === 'investment').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastPurchaseDate = lastInvestment ? new Date(lastInvestment.date).toLocaleDateString('en-CA') : 'never'; // YYYY-MM-DD format
    const investmentCount = transactions.filter(t => t.type === 'investment').length;

    let avgPurchasePrice = 0;
    let totalInvestedLKR = 0;
    let totalGramsBought = 0;
    transactions.filter(t => t.type === 'investment').forEach(t => {
        if (t.amountLKR && t.amountGrams > 0) {
            totalInvestedLKR += t.amountLKR;
            totalGramsBought += t.amountGrams;
        }
    });
    if (totalGramsBought > 0) {
        avgPurchasePrice = (totalInvestedLKR / totalGramsBought).toFixed(0);
    }

    return `User Summary:\nCurrent Balance: ${balance} grams.\nNumber of Investments: ${investmentCount}.\nLast Investment Date: ${lastPurchaseDate}.\nApprox. Avg. Purchase Price: ${avgPurchasePrice} LKR/gram.`;
}

// --- Updated Investment Timing Suggestion ---
async function getInvestmentTimingSuggestion(user) {
    if (!groq) return "AI service not available.";

    const recentMarketData = await getRecentGoldData(7);
    if (!recentMarketData || recentMarketData.length === 0) {
        console.error("Error or no data from getRecentGoldData for timing suggestion.");
        return "Could not retrieve recent gold data.";
    }
    const formattedMarketData = formatDataForPrompt(recentMarketData);
    const userDataSummary = summarizeUserData(user);

    const systemPrompt = `You are a helpful assistant for GoldNest in Sri Lanka. Analyze the recent daily gold price trend (LKR/Oz) AND the user's summary. Provide a very brief, neutral insight (1-2 sentences) connecting the recent market trend to the user's situation (e.g., "Market dipped slightly since your last purchase on YYYY-MM-DD.", "Prices are higher than your average purchase price."). Focus only on context, NOT direct advice to buy/not buy. Keep it concise for a UI box on the investment page.`;
    const userPrompt = `Recent Market Data (LKR/Oz):\n${formattedMarketData}\n\n${userDataSummary}\n\nBased on both market trend and user summary, provide a brief contextual insight for investing today.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: MODEL,
            temperature: 0.4,
            max_tokens: 70,
        });
        return chatCompletion.choices[0]?.message?.content.trim() || "Could not generate suggestion.";
    } catch (error) {
        console.error("Groq API Error (Investment Timing Suggestion):", error);
        return "Error fetching suggestion from AI.";
    }
}

// --- Monthly Growth Forecast (No Personalization Needed) ---
async function getMonthlyGrowthForecast() {
    if (!groq) return "AI service not available.";

    const recentData = await getRecentGoldData(30);
    if (!recentData || recentData.length === 0) {
        console.error("Error or no data from getRecentGoldData for monthly forecast.");
        return "Could not retrieve recent gold data.";
    }

    const formattedData = formatDataForPrompt(recentData);
    let monthlyChange = "N/A";
    if (recentData.length >= 2) {
        const latestPrice = recentData[0].LKR_per_Oz;
        const oldestPrice = recentData[recentData.length - 1].LKR_per_Oz;
        if (oldestPrice > 0) {
            monthlyChange = (((latestPrice - oldestPrice) / oldestPrice) * 100).toFixed(1) + "%";
        }
    }

    const systemPrompt = `You are a helpful assistant for GoldNest in Sri Lanka. Analyze the provided gold price trend (LKR per Troy Ounce) over the past month. Provide a *very brief* (1 sentence or short phrase) estimated potential growth outlook for the next month (e.g., "Potential for slight increase", "Trend suggests stability", "Recent dip noted"). Base this *only* on the provided data pattern. Also mention the calculated approximate percentage change over the provided period. Do NOT give specific percentages for the forecast. Be cautious and neutral. Example format: "Trend shows potential stability. Approx. change last month: +X.X%"`;
    const userPrompt = `LKR Gold Price Data (Last ~30 days, per Troy Oz):\n${formattedData}\nApprox change over this period: ${monthlyChange}\n\nBased *only* on this data pattern, provide a very brief estimated growth outlook phrase for the next month and mention the approximate change over the last month.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: MODEL,
            temperature: 0.4,
            max_tokens: 80,
        });
        let rawContent = chatCompletion.choices[0]?.message?.content.trim() || "Could not generate forecast.";
        const match = rawContent.match(/Approx\. change last month: ([+-]?\d+(\.\d+)?%)/);
        const changeText = match ? match[1] : monthlyChange;
        const percentageMatch = changeText.match(/[+-]?\d+(\.\d+)?/);
        const percentageValue = percentageMatch ? percentageMatch[0] + "%" : "N/A";

        return percentageValue;
    } catch (error) {
        console.error("Groq API Error (Growth Forecast):", error);
        return "Error fetching forecast from AI.";
    }
}

// --- Updated Dashboard Overview Suggestion ---
async function getDashboardOverviewSuggestion(user) {
    if (!groq) return "AI service not available.";

    const recentMarketData =await getRecentGoldData(14);
    if (!recentMarketData || recentMarketData.length === 0) {
        console.error("Error or no data from getRecentGoldData for dashboard overview.");
        return "Could not retrieve recent gold data.";
    }

    const formattedMarketData = formatDataForPrompt(recentMarketData);
    const userDataSummary = summarizeUserData(user);

    const systemPrompt = `You are an assistant for GoldNest in Sri Lanka. Analyze the recent gold price trend (LKR/Oz) and the user's summary. Write a brief (2-3 sentence) personalized overview connecting recent market activity (e.g., volatility, trend) to the user's current holdings or recent activity. Example: "Recent market stability aligns well with your current holding of X grams." or "Prices saw an increase recently, positively impacting your X gram balance since your last investment on YYYY-MM-DD." Do not give personal advice.`;
    const userPrompt = `Recent Market Data (LKR/Oz):\n${formattedMarketData}\n\n${userDataSummary}\n\nProvide a brief personalized overview connecting market activity to the user's situation.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: MODEL,
            temperature: 0.5,
            max_tokens: 100,
        });
        return chatCompletion.choices[0]?.message?.content.trim() || "Could not generate overview.";
    } catch (error) {
        console.error("Groq API Error (Dashboard Overview):", error);
        return "Error fetching overview from AI.";
    }
}

// --- Price Trend Summary (No Personalization Needed) ---
async function getPriceTrendSummary() {
    if (!groq) return "AI service not available.";

    const recentData = await getRecentGoldData(7);
    if (!recentData || recentData.length === 0) {
        console.error("Error or no data from getRecentGoldData for trend summary.");
        return "Could not retrieve recent gold data.";
    }

    const formattedData = formatDataForPrompt(recentData);
    const systemPrompt = `You are an assistant for the GoldNest platform. Based *only* on the provided recent daily LKR gold price data, state the primary trend in 1 short sentence (e.g., "Gold prices show an upward trend recently.", "Prices have shown some volatility.", "A recent dip in price was observed."). Then, add another very brief sentence suggesting a possible implication (e.g., "This suggests potential for further increase.", "Market conditions appear uncertain."). Be neutral and concise.`;
    const userPrompt = `Recent LKR Gold Price Data (Last 7 days, per Troy Oz):\n${formattedData}\n\nDescribe the primary trend and a possible implication in two short sentences.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: MODEL,
            temperature: 0.3,
            max_tokens: 70,
        });
        return chatCompletion.choices[0]?.message?.content.trim() || "Could not generate trend summary.";
    } catch (error) {
        console.error("Groq API Error (Trend Summary):", error);
        return "Error fetching trend summary from AI.";
    }
}


// --- NEW FUNCTION: AI Market Outlook ---
async function getMarketOutlookSuggestion() {
    if (!groq) return "AI service not available.";

    const recentData = await getRecentGoldData(30); // Use last 30 days for context
    const summary = await getGoldMarketSummary(); // Get latest stats

    if (!recentData || recentData.length === 0) {
        console.error("Error or no data from getRecentGoldData for market outlook.");
        return "Could not retrieve recent gold data.";
    }

    const formattedData = formatDataForPrompt(recentData);
    const summaryText = `The current price is around ${summary.latestPricePerGram.toFixed(0)} LKR/g. The daily change is ${summary.priceChangePercent.toFixed(1)}%, and the monthly change is ${summary.monthlyChangePercent.toFixed(1)}%.`;

    const systemPrompt = `You are a neutral financial analyst for GoldNest, a gold investment platform in Sri Lanka. Analyze the provided recent daily gold price data and the current summary. Provide a concise, 2-3 sentence market outlook. Mention the primary trend (e.g., "upward trend," "volatile period," "stabilizing phase") and a potential short-term outlook. Be cautious and avoid definitive predictions or financial advice. Frame it as an analytical summary.`;
    const userPrompt = `Recent Market Data (LKR/Oz):\n${formattedData}\n\nLatest Summary: ${summaryText}\n\nBased on this, provide a brief market outlook.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            model: MODEL,
            temperature: 0.5,
            max_tokens: 120,
        });
        return chatCompletion.choices[0]?.message?.content.trim() || "Could not generate outlook.";
    } catch (error) {
        console.error("Groq API Error (Market Outlook):", error);
        return "Error fetching outlook from AI.";
    }
}


module.exports = {
    getInvestmentTimingSuggestion,
    getMonthlyGrowthForecast,
    getDashboardOverviewSuggestion,
    getPriceTrendSummary,
    getMarketOutlookSuggestion, // <-- EXPORT NEW FUNCTION
};
