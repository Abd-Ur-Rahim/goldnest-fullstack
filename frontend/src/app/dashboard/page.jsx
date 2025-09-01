// src/app/dashboard/page.jsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import NavbarInternal from '@/components/NavbarInternal';
import FooterInternal from '@/components/FooterInternal';
import styles from './Dashboard.module.css';

// --- Skeleton Components ---
const PlaceholderText = ({ width = 'w-full', height = 'h-4', className = '' }) => (
  <div className={`skeleton skeleton-text ${width} ${height} mb-1 ${className}`}></div>
);

const PlaceholderTitle = ({ width = 'w-1/2', height = 'h-6', className = '' }) => (
  <div className={`skeleton skeleton-title ${width} ${height} mb-3 ${className}`}></div>
);

const PlaceholderCard = ({ children }) => (
  <div className={`${styles.card} animate-pulse`}>{children}</div>
);

const GamificationProgressSkeleton = () => (
  <div className={styles.gamification}>
    {[...Array(2)].map((_, i) => (
      <div
        key={i}
        className={`${styles.progressItem} opacity-50 space-x-3 p-3 border-b border-gray-200 last:border-b-0`}
      >
        <div className="skeleton h-8 w-8 rounded-full bg-gray-300 flex-shrink-0"></div>
        <div className="flex-grow space-y-2">
          <PlaceholderText width="w-3/4" height="h-4" />
          <div className="skeleton h-2 w-full rounded bg-gray-300"></div>
          <PlaceholderText width="w-1/2" height="h-3" />
        </div>
        <div className="skeleton h-7 w-20 rounded bg-gray-300"></div>
      </div>
    ))}
    <div className="flex justify-center mt-3">
      <PlaceholderText width="w-1/3" height="h-5" className="mx-auto" />
    </div>
  </div>
);

const RedeemProgressSkeleton = () => (
  <div className={`${styles.redeemCoin} animate-pulse text-center py-4`}>
    <div className="relative w-32 h-32 mx-auto mb-2">
      <div className="skeleton skeleton-circle w-full h-full bg-gray-300"></div>
    </div>
    <PlaceholderText width="w-16" height="h-6" className="mx-auto mb-2" />
    <PlaceholderText width="w-24" height="h-4" className="mx-auto mb-4" />
    <div className={`${styles.redeemOptions} flex justify-center space-x-2`}>
      <div className="skeleton skeleton-button h-8 w-16 bg-gray-300 rounded"></div>
      <div className="skeleton skeleton-button h-8 w-16 bg-gray-300 rounded"></div>
      <div className="skeleton skeleton-button h-8 w-16 bg-gray-300 rounded"></div>
    </div>
  </div>
);

// --- Helper Functions ---
const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 'Rs. 0.00';
  }
  return `Rs. ${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// src/app/dashboard/page.jsx

const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    // Always format the date to the "Month Day" format (e.g., "Aug 29")
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const formatGrams = (value, decimals = 3) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.000g';
  }
  return `${value.toFixed(decimals)}g`;
};

const TROY_OZ_TO_GRAMS = 31.1034768;

export default function DashboardPage() {
  // --- State ---
  const [userData, setUserData] = useState(null);
  const [marketData, setMarketData] = useState(null); // Will now contain new fields
  const [aiOverview, setAiOverview] = useState('');
  const [aiTrend, setAiTrend] = useState('');
  const [aiForecast, setAiForecast] = useState(''); // This is the *AI* forecast
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  // State for alerts
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState('');

  // --- Data Fetching ---
  useEffect(() => {
    setLoading(true);
    setError('');
    const token = localStorage.getItem('userToken');
    if (!token) {
      router.push('/');
      return;
    }
    const config = { headers: { Authorization: `Bearer ${token}` } };
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

    const fetchDashboardData = async () => {
      try {
        // Fetch user data, market summary (now with predictions/trends), and AI insights
        const [userRes, marketRes, overviewRes, trendRes, forecastRes] = await Promise.all([
          axios.get(`${backendUrl}/api/users/me`, config),
          axios.get(`${backendUrl}/api/market/gold-summary`), // Expects new fields here
          axios.get(`${backendUrl}/api/ai/dashboard-overview`, config),
          axios.get(`${backendUrl}/api/ai/trend-summary`),
          axios.get(`${backendUrl}/api/ai/monthly-forecast`),
        ]);

        if (!userRes.data || !marketRes.data) {
          throw new Error('Missing essential user or market data.');
        }

        setUserData(userRes.data);
        setMarketData(marketRes.data); // Contains latestPricePerGram, previousDaysData, priceChangePercent, weeklyChangePercent, monthlyChangePercent, predictedTomorrowPricePerGram, predictedTomorrowChangePercent, trend, latestDate etc.
        setAiOverview(
          overviewRes.data?.overview ||
            'AI overview is currently processing. Check back soon.'
        );
        setAiTrend(
          trendRes.data?.summary ||
            'AI trend summary is currently unavailable.'
        );
        setAiForecast(forecastRes.data?.forecast || 'N/A');
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load dashboard data.');
        if (err.response?.status === 401) {
          localStorage.removeItem('userToken');
          router.push('/');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [router]); // Dependency on router

  // Fetch alerts
  useEffect(() => {
    const token = localStorage.getItem('userToken');
    if (!token) return;

    const config = { headers: { Authorization: `Bearer ${token}` } };
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

    const fetchAlerts = async () => {
      setLoadingAlerts(true);
      setAlertsError('');
      try {
        const { data } = await axios.get(
          `${backendUrl}/api/notifications?limit=3&sort=-createdAt`,
          config
        );
        setAlerts(data.notifications || []);
      } catch (err) {
        console.error('Error fetching alerts:', err.response?.data?.message || err.message);
        if (err.response?.status !== 401) {
             setAlertsError('Failed to load alerts.');
        }
      } finally {
        setLoadingAlerts(false);
      }
    };

    fetchAlerts(); // Fetch regardless of main data load status for now

  }, []); // Keep empty dependency array as specified in user prompt


  // --- Derived Data (Use backend data where applicable) ---
  const goldBalanceGrams = userData?.goldBalanceGrams ?? 0;
  const currentGoldValueLKR = userData?.currentGoldValueLKR ?? 0; // From backend
  const overallProfitLKR = userData?.overallProfitLKR ?? 0;       // From backend
  const overallProfitPercent = userData?.overallProfitPercent ?? 0; // From backend
  const avgPurchasePrice = userData?.averagePurchasePricePerGram ?? 0; // From backend

  const lastPurchase = useMemo(
    () =>
      (userData?.transactions || [])
        .filter((t) => t.type === 'investment' && t.status === 'completed')
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null,
    [userData?.transactions]
  );

  // --- V V V Get NEW values from marketData V V V ---
  const currentPricePerGram = marketData?.latestPricePerGram || 0; // Use 0 if not loaded
  const dailyChangePercent = marketData?.priceChangePercent ?? 0; // This is daily
  const weeklyChangePercent = marketData?.weeklyChangePercent ?? 0;
  const monthlyChangePercent = marketData?.monthlyChangePercent ?? 0;
  const predictedTomorrowPrice = marketData?.predictedTomorrowPricePerGram ?? 0;
  const predictedTomorrowChange = marketData?.predictedTomorrowChangePercent ?? 0; // Prediction change %
  const marketTrend = marketData?.trend ?? 'stable'; // 'up', 'down', or 'stable'
  // --- ^ ^ ^ END Get NEW values ^ ^ ^ ---

  // --- Gamification Data ---
   const challengeProgressMap = useMemo(
    () => userData?.challengeProgress || {},
    [userData?.challengeProgress]
  );
   const activeChallenges = useMemo(
    () => userData?.gamificationDefs?.challenges || [],
    [userData?.gamificationDefs]
  );

  // --- Redemption Progress ---
  const getRedeemProgress = (target) =>
    goldBalanceGrams > 0 && target > 0 ? Math.min(100, (goldBalanceGrams / target) * 100) : 0;
  const progress1g = useMemo(() => getRedeemProgress(1), [goldBalanceGrams]);
  const progress5g = useMemo(() => getRedeemProgress(5), [goldBalanceGrams]);
  const progress10g = useMemo(() => getRedeemProgress(10), [goldBalanceGrams]);
  const neededFor10g = useMemo(() => Math.max(0, 10 - goldBalanceGrams), [goldBalanceGrams]);

  // --- Render Logic ---
  const renderLoadingSkeleton = () => (
    <div className={styles.dashboard}>
      {/* Top Row Skeleton */}
      <div className={`${styles.dashboardRow} ${styles.topRow}`}>
        <PlaceholderCard>
          <PlaceholderTitle width="w-1/3" />
          <div className="animate-pulse space-y-4 p-4">
            <div className="flex items-center space-x-4">
              <div className="skeleton skeleton-circle w-12 h-12 bg-gray-300"></div>
              <div className="flex-1 space-y-2">
                <PlaceholderText width="w-1/2" />
                <PlaceholderText width="w-3/4" height="h-5" />
                <PlaceholderText width="w-1/2" />
              </div>
            </div>
            <PlaceholderText width="w-full" height="h-10" />
            <div className="border-t border-gray-200 pt-4 mt-4 space-y-3">
              <PlaceholderText width="w-1/3" />
              <PlaceholderText width="w-1/2" height="h-5" />
              <PlaceholderText width="w-1/3" />
              <PlaceholderText width="w-1/2" height="h-5" />
              <PlaceholderText width="w-1/3" />
              <PlaceholderText width="w-1/2" height="h-5" />
            </div>
            <div className="flex justify-end mt-4">
              <PlaceholderText width="w-1/4" height="h-8" />
            </div>
          </div>
        </PlaceholderCard>
        <PlaceholderCard>
          <PlaceholderTitle width="w-1/3" />
          <div className="animate-pulse space-y-4 p-4">
            <PlaceholderText width="w-1/4" height="h-5" />
            <PlaceholderText width="w-3/4" height="h-8" />
            <div className="space-y-2 mb-3">
                <PlaceholderText width="w-full" height="h-3"/>
                <PlaceholderText width="w-full" height="h-3"/>
                <PlaceholderText width="w-full" height="h-3"/>
            </div>
            <div className="space-y-2 mb-3">
                 <PlaceholderText width="w-1/3" height="h-4" />
                 <PlaceholderText width="w-1/2" height="h-4" />
            </div>
             <div className="space-y-2 mb-3">
                 <PlaceholderText width="w-1/3" height="h-4" />
                 <PlaceholderText width="w-1/2" height="h-4" />
            </div>
            <div className="space-y-2 mb-3">
                <PlaceholderText width="w-full" height="h-3" />
            </div>
            <PlaceholderText width="w-full" height="h-10" /> {/* AI Insight Placeholder */}
            <div className="flex justify-end mt-4">
              <PlaceholderText width="w-1/4" height="h-8" />
            </div>
          </div>
        </PlaceholderCard>
      </div>
      {/* Middle Row Skeleton */}
      <div className={`${styles.dashboardRow} ${styles.middleRow}`}>
        <PlaceholderCard>
          <div className="p-4 flex flex-col items-center sm:flex-row sm:justify-between">
            <div className="flex-grow mb-3 sm:mb-0 sm:mr-4">
              <PlaceholderTitle width="w-3/4" height="h-5" />
              <PlaceholderText width="w-full" height="h-4" />
            </div>
            <PlaceholderText width="w-24" height="h-10" className="rounded" />
          </div>
        </PlaceholderCard>
      </div>
      {/* Bottom Row Skeleton */}
      <div className={`${styles.dashboardRow} ${styles.bottomRow}`}>
        <PlaceholderCard>
          <PlaceholderTitle width="w-1/2" className="ml-4 mt-4" />
          <GamificationProgressSkeleton />
        </PlaceholderCard>
        <PlaceholderCard>
          <PlaceholderTitle width="w-1/3" className="ml-4 mt-4" />
          <div className="p-4 space-y-3">
            <PlaceholderText height="h-5" width="w-full" />
            <PlaceholderText height="h-5" width="w-full" />
            <PlaceholderText height="h-5" width="w-full" />
            <div className="flex justify-end mt-2">
              <PlaceholderText width="w-1/3" height="h-6" />
            </div>
          </div>
        </PlaceholderCard>
        <PlaceholderCard>
          <PlaceholderTitle width="w-1/2" className="ml-4 mt-4" />
          <RedeemProgressSkeleton />
        </PlaceholderCard>
      </div>
    </div>
  );

  // --- Conditional Rendering ---
  if (loading)
    return (
      <>
        <NavbarInternal />
        {renderLoadingSkeleton()}
        <FooterInternal />
      </>
    );
  if (error)
    return (
      <>
        <NavbarInternal />
        <div className="p-10 text-center text-red-500 card mx-auto my-10 max-w-md">
          Error: {error}
          {(error.includes('load dashboard data') || error.includes('essential user or market data')) && (
            <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
                Retry
            </button>
          )}
        </div>
        <FooterInternal />
      </>
    );
  if (!userData || !marketData)
    return (
      <>
        <NavbarInternal />
        <div className="p-10 text-center text-orange-600 card mx-auto my-10 max-w-md">
          Could not load essential dashboard data. Please try again later or contact support.
           <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
                Retry
            </button>
        </div>
        <FooterInternal />
      </>
    );

  // --- Main Render ---
  return (
    <>
      <NavbarInternal />
      <section className={styles.dashboard}>
        {/* Top Row */}
        <div className={`${styles.dashboardRow} ${styles.topRow}`}>
          {/* Gold Holdings Card (Remains Unchanged) */}
          <div className={styles.card}>
            <h3>Your Gold Holdings</h3>
            <div className={styles.goldHoldings}>
              <div className={styles.goldHoldingsSplit}>
                <div className={styles.totalOwnedSection}>
                  <div className={styles.totalOwned}>
                    <Image src="/gold-icon.png" alt="Gold Icon" width={48} height={48} />
                    <div>
                      <p>Total Owned</p>
                      <h2>{formatGrams(goldBalanceGrams)}</h2>
                      <p className={styles.highlight}>{formatCurrency(currentGoldValueLKR)}</p>
                    </div>
                  </div>
                  <div className={styles.aiInsight}>
                    <span className={styles.aiLabel}>✨ AI Overview</span>
                    <p>{aiOverview || 'Loading AI insight...'}</p>
                  </div>
                </div>
                <div className={styles.detailsSection}>
                  <div className={styles.profit}>
                    <p>Overall Profit</p>
                    <h4>
                      {formatCurrency(overallProfitLKR)}{' '}
                      <span className={`${styles.profitPercentage} ${overallProfitLKR >= 0 ? styles.positive : styles.negative}`}>
                           {overallProfitLKR >= 0 ? '+' : ''}{overallProfitPercent.toFixed(1)}%
                      </span>
                    </h4>
                  </div>
                  <div className={styles.averagePrice}>
                    <p>Average Purchase Price</p>
                    <h4>{formatCurrency(avgPurchasePrice)} /gram</h4>
                  </div>
                  <div className={styles.lastPurchase}>
                    <p>Your last purchase</p>
                    <h4>
                      {lastPurchase
                        ? `${formatGrams(lastPurchase.amountGrams)} (${formatCurrency(lastPurchase.amountLKR)})`
                        : 'N/A'}
                    </h4>
                    <p className={styles.date}>
                      {lastPurchase ? formatDate(lastPurchase.date) : ''}
                    </p>
                  </div>
                </div>
              </div>
              <Link href="/wallet" className={`${styles.btnSecondary} ${styles.seeMore}`}>
                Go to Wallet <i className="fas fa-arrow-right"></i>
              </Link>
            </div>
          </div>

          {/* --- V V V Live Price Card - UPDATED V V V --- */}
          <div className={styles.card}>
            <h3>
              Gold Live Price <span className={styles.carat}>24 Carats</span>
            </h3>
            <div className={styles.livePrice}>
              <div className={styles.livePriceSplit}>
                <div className={styles.priceHistorySection}>
                  <div className={styles.priceHeader}>
                    <i className="fas fa-clock"></i>
                    <p>Today</p>
                    <p className={styles.date}>
                      {/* Use marketData.latestDate */}
                      {marketData.latestDate ? formatDate(marketData.latestDate) : 'Loading...'}
                    </p>
                  </div>
                  {/* Use marketData.latestPricePerGram */}
                  <h2 className={styles.currentPrice}>{formatCurrency(currentPricePerGram)} /g</h2>
                  <div className={styles.recentPrices}>
                    {/* Use marketData.previousDaysData */}
                    {(marketData.previousDaysData?.length > 0 ? marketData.previousDaysData.slice(-3).reverse() : []).map((day, idx) => (
                      <div key={idx} className={styles.recentPriceItem}>
                        <p>{formatDate(day.date)}</p>
                        {/* Use pricePerGram directly if available, else calculate */}
                        <span>{formatCurrency(day.pricePerGram || (day.pricePerOz ? day.pricePerOz / TROY_OZ_TO_GRAMS : 0))} /g</span>
                      </div>
                    ))}
                    {!marketData.previousDaysData?.length && (
                         <div className={styles.recentPriceItem}>
                            <p className='text-gray-400'>No recent data</p>
                            <span></span>
                         </div>
                    )}
                  </div>
                </div>
                <div className={styles.trendSection}>
                  <div className={styles.trend}>
                    <div className={styles.trendHeader}>
                      <i className="fas fa-chart-line"></i>
                      {/* Use marketData daily change % and trend */}
                      <p className={`${styles.priceChange} ${dailyChangePercent >= 0 ? styles.positive : styles.negative}`}>
                        {dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(1)}%
                        <i className={`fas fa-arrow-${marketTrend === 'up' ? 'up' : marketTrend === 'down' ? 'down' : 'right'}`}></i>
                      </p>
                    </div>
                    <div className={styles.trendMetrics}>
                      {/* --- Use new weekly % --- */}
                      <div className={styles.trendMetric}>
                        <p>This Week</p>
                        <span className={weeklyChangePercent >= 0 ? styles.positive : styles.negative}>
                          {weeklyChangePercent >= 0 ? '+' : ''}{weeklyChangePercent.toFixed(1)}%
                        </span>
                      </div>
                      {/* --- Use new monthly % --- */}
                      <div className={styles.trendMetric}>
                        <p>This Month</p>
                        <span className={monthlyChangePercent >= 0 ? styles.positive : styles.negative}>
                           {monthlyChangePercent >= 0 ? '+' : ''}{monthlyChangePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className={styles.prediction}>
                      {/* --- Use new predicted values --- */}
                      <p>
                        Predicted Tomorrow:{' '}
                        <span>
                            {predictedTomorrowPrice > 0
                             ? `${formatCurrency(predictedTomorrowPrice)} /g (${predictedTomorrowChange >= 0 ? '+' : ''}${predictedTomorrowChange.toFixed(1)}%)`
                             : <span className='text-gray-500'>N/A</span>
                            }
                        </span>
                      </p>
                    </div>
                    <div className={styles.aiInsight}>
                      <span className={styles.aiLabel}>✨ AI Trend</span>
                      <p>
                        {aiTrend || 'Loading AI trend...'} {/* Display AI trend */}
                         {/* Link to internal market page */}
                        {aiTrend && <Link href="/marketinternal" className={styles.aiLink}>Learn More</Link>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Link to internal market page */}
              <Link href="/marketinternal" className={`${styles.btnSecondary} ${styles.seeMore}`}>
                See Full History <i className="fas fa-arrow-right"></i>
              </Link>
            </div>
          </div>
           {/* --- ^ ^ ^ END Live Price Card - UPDATED ^ ^ ^ --- */}
        </div>

        {/* Middle Row (Updated for AI Forecast clarity) */}
         <div className={`${styles.dashboardRow} ${styles.middleRow}`}>
             <div className={`${styles.card} ${styles.ctaCard}`}>
                 <h3>Buy your gold now with just 2 clicks!</h3>
                 <p>
                     {/* Display separate AI forecast here */}
                     <span className={styles.aiLabel}>✨ AI Forecast</span> Trend shows potential growth next month: <span className={styles.highlight}>{aiForecast !== 'N/A' ? aiForecast : 'Loading...'}</span>.
                 </p>
                 <Link href="/trade" className={styles.btnPrimary}>
                     Buy Gold
                 </Link>
             </div>
         </div>

        {/* Bottom Row */}
        <div className={`${styles.dashboardRow} ${styles.bottomRow}`}>
          {/* --- V V V Gamification Card - UPDATED V V V --- */}
          <div className={styles.card}>
            <h3>Gamification Progress</h3>
            {activeChallenges.length > 0 ? (
                <div className={styles.gamification}>
                    {activeChallenges.slice(0, 2).map((challenge) => {
                        if (!challenge || typeof challenge.goal !== 'number') return null;
                        
                        // --- START OF FIX ---
                        // Use challenge._id for the key, as it comes from MongoDB
                        const challengeIdStr = challenge._id.toString(); 
                        // --- END OF FIX ---

                        const currentProgress = challengeProgressMap[challengeIdStr] || 0;
                        const goal = challenge.goal;
                        const progressPercent = goal > 0 ? Math.min(100, (currentProgress / goal) * 100) : (currentProgress > 0 ? 100 : 0);
                        const isCompleted = currentProgress >= goal;
                        const isClaimed = challengeProgressMap[`${challengeIdStr}_claimed`] === true;
                        const needed = Math.max(0, goal - currentProgress);
                        
                        let progressText = 'Error calculating progress';
                        if (isCompleted) {
                            progressText = 'Completed!';
                        } else if (goal > 0) {
                            progressText = `${challenge.unit === 'LKR' ? formatCurrency(needed) : needed.toFixed(0)} ${challenge.unit || ''} more`;
                        } else {
                            progressText = 'Goal reached!';
                        }
                        const iconClass = `fas ${isCompleted ? 'fa-check-circle' : challenge.icon || 'fa-trophy'}`;

                        return (
                            <div
                                // --- APPLY THE FIX HERE ---
                                key={challenge._id} 
                                className={`${styles.progressItem} ${isCompleted ? styles.completed : ''}`}
                                data-status={isCompleted ? 'completed' : 'incomplete'}
                            >
                                <Link href="/gamification" className={styles.progressLink}>
                                    <i className={`${iconClass} ${isCompleted ? 'text-green-500' : 'text-gray-400'}`}></i>
                                    <div className={styles.progressText}>
                                        <p>
                                            {challenge.name || 'Unnamed Challenge'}
                                            {/* Use rewardValue for stars from dynamic challenges */}
                                            {challenge.rewardValue > 0 && ( 
                                                <span className={styles.starEarn}>
                                                    {' '}
                                                    Earn {challenge.rewardValue} ★
                                                </span>
                                            )}
                                        </p>
                                        {challenge.rewardText && (
                                            <p className={styles.rewardText}>
                                                Reward: {challenge.rewardText}
                                                {/* Your badge logic here */}
                                            </p>
                                        )}
                                        <div className={styles.progressBar}>
                                            <div
                                                className={`${styles.progress} ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                                                style={{ width: `${progressPercent}%` }}
                                            ></div>
                                        </div>
                                        <p className={styles.progressAmount}>{progressText}</p>
                                    </div>
                                </Link>
                                <div className={styles.progressCta}>
                                     {isCompleted && !isClaimed ? (
                                        <Link href="/gamification" className={styles.ctaBtnClaim}>
                                            Claim
                                        </Link>
                                    ) : isCompleted ? (
                                       <span className={styles.badge}>Done</span>
                                    ) : (
                                        <Link href={'/trade'} className={styles.ctaBtnGo}>
                                            Go
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <Link href="/gamification" className={`${styles.btnSecondary} ${styles.seeMore}`}>
                        Go to Rewards <i className="fas fa-arrow-right"></i>
                    </Link>
                </div>
            ) : (
                <p className="text-center text-gray-500 py-6 px-4">
                    No active challenges right now. Keep investing!
                </p>
            )}
          </div>
          {/* --- ^ ^ ^ Gamification Card - UPDATED ^ ^ ^ --- */}

          {/* Alerts Card */}
          <div className={styles.card}>
            <h3>Alerts</h3>
            <div className={styles.alerts}>
              {loadingAlerts ? (
                <p className="text-center text-gray-500 py-4 text-sm">Loading alerts...</p>
              ) : alertsError ? (
                <p className="text-center text-red-500 py-4 text-sm">{alertsError}</p>
              ) : alerts.length > 0 ? (
                alerts.map((alert) => (
                  <Link
                    href={alert.link || '#'}
                    key={alert._id}
                    className={`${styles.alertItem} ${alert.link ? styles.alertLink : ''}`}
                    onClick={(e) => !alert.link && e.preventDefault()}
                  >
                    <p>
                      <strong>{alert.title || 'Notification'}:</strong> {alert.message || 'No details.'}
                    </p>
                    <span>{formatDate(alert.createdAt)}</span>
                  </Link>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4 text-sm">No recent alerts.</p>
              )}
              <Link href="/notifications" className={`${styles.btnSecondary} ${styles.seeMore}`}>
                See All Alerts <i className="fas fa-arrow-right"></i>
              </Link>
            </div>
          </div>

          {/* Redeem Card */}
          <div className={styles.card}>
            <h3>Redeem Gold Coin</h3>
            <div className={styles.redeemCoin}>
              <div className={styles.progressCircle}>
                <svg className={styles.progressRing} viewBox="0 0 36 36">
                  <circle
                    className={styles.progressRingBackground}
                    cx="18" cy="18" r="15.915"
                    fill="transparent"
                    strokeWidth="3"
                  />
                  <circle
                    className={styles.progressRingFill}
                    cx="18" cy="18" r="15.915"
                    fill="transparent"
                    strokeWidth="3"
                    strokeDasharray={`${progress10g}, 100`}
                    strokeDashoffset="0"
                    transform="rotate(-90 18 18)"
                  />
                </svg>
                <Image
                  src="/gold-icon.png"
                  alt="Gold Coin"
                  width={80}
                  height={80}
                  className={styles.goldIcon}
                />
              </div>
              <p className={styles.progressPercentage}>{progress10g.toFixed(0)}% to 10g</p>
              <p className={styles.progressText}>
                  {progress10g < 100 ? `Need ${formatGrams(neededFor10g)} more` : '10g Redeemable!'}
              </p>
              <div className={styles.redeemOptions}>
                {[1, 5, 10].map((grams) => {
                   const currentProgress = getRedeemProgress(grams);
                   const canRedeem = currentProgress >= 100;
                   return (
                      <Link
                        key={grams}
                        href={canRedeem ? `/redeem-confirmation/${grams}g/1` : '#'}
                        className={`${styles.btnSecondary} ${
                          !canRedeem ? styles.btnDisabled : styles.btnActive
                        }`}
                        aria-disabled={!canRedeem}
                        onClick={(e) => {
                          if (!canRedeem) e.preventDefault();
                        }}
                      >
                        {grams}g
                      </Link>
                   );
                })}
              </div>
               <Link href="/wallet#redeem" className={`${styles.btnSecondary} ${styles.seeMore} ${styles.redeemMore}`}>
                 More Options <i className="fas fa-arrow-right"></i>
               </Link>
            </div>
          </div>
        </div>
      </section>
      <FooterInternal />
    </>
  );
}
