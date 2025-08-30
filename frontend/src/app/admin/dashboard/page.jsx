// src/app/admin/dashboard/page.jsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import styles from './Dashboard.module.css';

Chart.register(...registerables);

const StatCard = ({ title, value, icon }) => (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ backgroundColor: icon.bgColor }}>
        <i className={`fas ${icon.name}`}></i>
      </div>
      <div className={styles.statTextContainer}>
        <p className={styles.statLabel}>{title}</p>
        <p className={styles.statValue}>{value}</p>
      </div>
    </div>
);

const getActivityIcon = (type) => {
    switch(type) {
        case 'investment': return { name: 'fa-coins', color: styles.iconInvestment };
        case 'deposit': return { name: 'fa-piggy-bank', color: styles.iconUser };
        case 'withdrawal': return { name: 'fa-hand-holding-usd', color: styles.iconWithdrawal };
        case 'redemption': return { name: 'fa-box-open', color: styles.iconRedemption };
        default: return { name: 'fa-history', color: styles.iconDefault };
    }
};

const AdminDashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [userChartData, setUserChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminName, setAdminName] = useState('Admin');
  const router = useRouter();
  const barChartRef = useRef(null);
  const barChartInstanceRef = useRef(null);

  // This useEffect correctly enforces superadmin-only access.
  useEffect(() => {
    const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
    
    // 1. Check if logged in at all
    if (!adminInfo) {
        router.push('/gn-admin-portal');
        return; // Stop execution
    }

    // 2. Check if the role is 'superadmin'
    if (adminInfo.role !== 'superadmin') {
        // Redirect non-superadmins to a safe default page
        router.push('/admin/users'); 
        return; // Stop execution
    }
    
    // 3. If checks pass, proceed with loading dashboard data
    setAdminName(adminInfo.name);

    const fetchData = async () => {
      try {
        const token = adminInfo?.token;
        if (!token) throw new Error('Admin token not found');

        const config = { headers: { Authorization: `Bearer ${token}` } };
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
        
        const [statsRes, txRes, userChartRes] = await Promise.all([
          axios.get(`${backendUrl}/api/admin/stats/dashboard`, config),
          axios.get(`${backendUrl}/api/admin/stats/recent-transactions`, config),
          axios.get(`${backendUrl}/api/admin/stats/user-chart`, config),
        ]);

        setStats(statsRes.data);
        setRecentTx(txRes.data);
        setUserChartData(userChartRes.data);

      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch dashboard data.');
        // The backend middleware will return 403 (Forbidden) if a non-superadmin tries to access
        if (err.response?.status === 401 || err.response?.status === 403) {
            localStorage.removeItem('adminInfo');
            router.push('/gn-admin-portal');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    if (userChartData.length > 0 && barChartRef.current) {
        if (barChartInstanceRef.current) barChartInstanceRef.current.destroy();
        const ctx = barChartRef.current.getContext('2d');
        barChartInstanceRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: userChartData.map(d => d._id),
                datasets: [{
                    label: 'New Users',
                    data: userChartData.map(d => d.count),
                    backgroundColor: '#FBBF24',
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    x: { type: 'time', time: { unit: 'day' }, grid: { display: false } }, 
                    y: { beginAtZero: true, ticks: { stepSize: 1 } } 
                },
                plugins: { legend: { display: false } }
            }
        });
    }
  }, [userChartData]);

  if (loading) return <div>Loading Dashboard...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;
  
  // This content will only be rendered if the user is a superadmin and data has loaded
  if (!stats) return <div>Loading statistics...</div>;

  const formattedVolume = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', notation: 'compact', maximumFractionDigits: 2 }).format(stats.totalVolume);

  return (
    <div className="space-y-8">
      <div>
          <h1 className={styles.headerTitle}>Welcome back, {adminName}!</h1>
          <p className={styles.headerSubtitle}>Here's a snapshot of your platform's activity.</p>
      </div>
      
      <div className={styles.statsGrid}>
        <StatCard title="Total Users" value={stats.totalUsers} icon={{ name: 'fa-users', bgColor: '#3B82F6' }} />
        <StatCard title="New Users Today" value={stats.newUsersToday} icon={{ name: 'fa-user-plus', bgColor: '#10B981' }} />
        <StatCard title="Total Investment Volume" value={formattedVolume} icon={{ name: 'fa-coins', bgColor: '#F59E0B' }} />
        <StatCard 
                title="Pending Redemptions" 
                value={stats.pendingRedemptions} 
                icon={{ name: 'fa-box-open', bgColor: '#EF4444' }} 
            />
      </div>

      <div className={styles.widgetsGrid}>
        <div className={`${styles.mainWidget} ${styles.chartCard}`}>
            <h2 className={styles.widgetTitle}>New User Signups (Last 30 Days)</h2>
            <div className={styles.chartContainer}><canvas ref={barChartRef}></canvas></div>
        </div>
        
        <div className={`${styles.mainWidget} ${styles.activityCard}`}>
            <h2 className={styles.widgetTitle}>Recent Activity</h2>
            <ul className={styles.activityList}>
                {recentTx.length > 0 ? recentTx.map(tx => {
                    const icon = getActivityIcon(tx.type);
                    return (
                        <li key={tx._id} className={styles.activityItem}>
                            <div className={styles.activityIcon}>
                                <i className={`fas ${icon.name} ${icon.color}`}></i>
                            </div>
                            <div className={styles.activityText}>
                                <p>{tx.userName || 'An unknown user'} made a {tx.type.replace('_', ' ')}.</p>
                                <p>{new Date(tx.date).toLocaleString()}</p>
                            </div>
                        </li>
                    )
                }) : (
                    <p className="text-sm text-gray-500">No recent transactions found.</p>
                )}
            </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;