// src/app/marketinternal/page.jsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import axios from 'axios';
import NavbarInternal from '@/components/NavbarInternal';
import FooterInternal from '@/components/FooterInternal';
import styles from './MarketInternal.module.css'; // <-- IMPORT THE NEW CSS MODULE

Chart.register(...registerables);

// --- Helper Functions ---
const formatCurrency = (value) => {
    if (value === null || isNaN(value)) return 'N/A';
    return `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value) => {
    if (value === null || isNaN(value)) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

// --- Main Component ---
export default function MarketInternalPage() {
    // State
    const [marketSummary, setMarketSummary] = useState(null);
    const [historicalData, setHistoricalData] = useState({ labels: [], prices: [] });
    const [aiOutlook, setAiOutlook] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [timeRange, setTimeRange] = useState('1Y'); // Default time range (1Y, 3M, 1M, All)

    // Chart Refs
    const chartCanvasRef = useRef(null);
    const chartInstanceRef = useRef(null);

    // Data Fetching
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

    // Extract fetching logic into function
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryRes, historyRes, outlookRes] = await Promise.all([
                axios.get(`${backendUrl}/api/market/gold-summary`),
                axios.get(`${backendUrl}/api/market/historical-data`),
                axios.get(`${backendUrl}/api/ai/market-outlook`),
            ]);
            setMarketSummary(summaryRes.data);
            setHistoricalData(historyRes.data);
            setAiOutlook(outlookRes.data.outlook || 'AI analysis currently unavailable.');
            setError('');
        } catch (err) {
            console.error('Error fetching market data:', err);
            setError('Failed to load market data. Please try refreshing.');
        } finally {
            setLoading(false);
        }
    }, [backendUrl]);

    useEffect(() => {
        fetchData(); // Initial fetch

        // Set up interval for periodic fetching
        const intervalId = setInterval(() => {
            fetchData();
        }, 30000); // 30 seconds

        // Cleanup on unmount
        return () => clearInterval(intervalId);
    }, [fetchData]);

    // Chart Rendering Logic
    const renderChart = useCallback(() => {
        if (!chartCanvasRef.current || historicalData.labels.length === 0) return;

        const ctx = chartCanvasRef.current.getContext('2d');
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        const allLabels = historicalData.labels.map(label => new Date(label));
        const allPrices = historicalData.prices;
        
        let filteredLabels = allLabels;
        let filteredPrices = allPrices;

        const now = new Date();
        let startDate;

        switch (timeRange) {
            case '1M':
                startDate = new Date(new Date().setMonth(now.getMonth() - 1));
                break;
            case '3M':
                startDate = new Date(new Date().setMonth(now.getMonth() - 3));
                break;
            case '1Y':
                startDate = new Date(new Date().setFullYear(now.getFullYear() - 1));
                break;
            case 'All':
            default:
                startDate = new Date(allLabels[0]);
                break;
        }

        const startIndex = allLabels.findIndex(label => label >= startDate);
        if (startIndex !== -1) {
            filteredLabels = allLabels.slice(startIndex);
            filteredPrices = allPrices.slice(startIndex);
        }

        chartInstanceRef.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: filteredLabels,
                datasets: [{
                    label: 'Gold Price (LKR/gram)',
                    data: filteredPrices,
                    borderColor: '#F8B612',
                    backgroundColor: 'rgba(248, 182, 18, 0.1)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month' },
                        grid: { display: false },
                    },
                    y: {
                        ticks: {
                            callback: value => `Rs. ${value.toLocaleString()}`
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => `Price: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }, [historicalData, timeRange]);

    useEffect(() => {
        renderChart();
    }, [renderChart]);

    const renderMetricCard = (label, value, change) => (
        <div className={styles.metricCard}>
            <p className={styles.metricLabel}>{label}</p>
            <p className={styles.metricValue}>{value}</p>
            {change !== null && (
                <p className={`${styles.metricChange} ${change >= 0 ? styles.positive : styles.negative}`}>
                    {change >= 0 ? '▲' : '▼'} {formatPercent(change)}
                </p>
            )}
        </div>
    );

    if (loading) {
        return (
            <>
                <NavbarInternal />
                <main className={styles.pageWrapper}>
                    <p className="text-center">Loading market data...</p>
                </main>
                <FooterInternal />
            </>
        );
    }
    if (error) {
         return (
            <>
                <NavbarInternal />
                <main className={`${styles.pageWrapper} text-red-500 text-center`}>
                    <p>{error}</p>
                </main>
                <FooterInternal />
            </>
        );
    }

    return (
        <>
            <NavbarInternal />
            <main className={styles.pageWrapper}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Gold Market Overview</h1>
                </div>

                {/* Metric Cards */}
                <div className={styles.metricCardGrid}>
                    {renderMetricCard("Latest Price/g", formatCurrency(marketSummary?.latestPricePerGram), null)}
                    {renderMetricCard("24h Change", formatPercent(marketSummary?.priceChangePercent), marketSummary?.priceChangePercent)}
                    {renderMetricCard("7d Change", formatPercent(marketSummary?.weeklyChangePercent), marketSummary?.weeklyChangePercent)}
                    {renderMetricCard("30d Change", formatPercent(marketSummary?.monthlyChangePercent), marketSummary?.monthlyChangePercent)}
                </div>

                {/* Chart Section */}
                <div className={styles.chartCard}>
                    <div className={styles.chartControls}>
                        <span className={styles.timeRangeLabel}>Time Range:</span>
                        {['1M', '3M', '1Y', 'All'].map(range => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`${styles.timeRangeButton} ${timeRange === range ? styles.timeRangeButtonActive : styles.timeRangeButtonInactive}`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                    <div className={styles.chartContainer}>
                        <canvas ref={chartCanvasRef}></canvas>
                    </div>
                </div>

                {/* AI Analysis Section */}
                <div className={styles.aiCard}>
                     <h2 className={styles.aiTitle}>
                        <span className={styles.aiIcon}>✨</span> AI Market Analysis
                    </h2>
                    <p className={styles.aiText}>{aiOutlook}</p>
                </div>
                
                 <p className={styles.disclaimer}>
                    Disclaimer: Market data and AI analysis are provided for informational purposes only and do not constitute financial advice. Past performance is not indicative of future results.
                </p>
            </main>
            <FooterInternal />
        </>
    );

}
