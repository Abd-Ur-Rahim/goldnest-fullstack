// src/app/admin/layout.jsx
'use client';
import React, { useState, useEffect, useRef } from 'react'; // Import useRef
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './AdminLayout.module.css';
import axios from 'axios';
import { useModal } from '../../contexts/ModalContext';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

const AdminLayout = ({ children }) => {
    const router = useRouter();
    const pathname = usePathname();
    const [adminRole, setAdminRole] = useState('');
    
    // Use a ref to ensure session validation only runs once per hard load
    const hasValidatedSession = useRef(false);
    const { openGenericModal } = useModal();
    useEffect(() => {
        const adminInfoString = localStorage.getItem('adminInfo');
        if (!adminInfoString) {
            router.push('/gn-admin-portal');
            return;
        }

        const adminInfo = JSON.parse(adminInfoString);
        setAdminRole(adminInfo.role);

        // This logic ensures the session is checked only on the initial load,
        // preventing the race condition that caused the refresh button to log the user out.
        if (!hasValidatedSession.current) {
            const validateSession = async () => {
                try {
                    const token = adminInfo?.token;
                    if (!token) throw new Error("No token found");
                    const config = { headers: { Authorization: `Bearer ${token}` } };
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
                    await axios.get(`${backendUrl}/api/admin/auth/validate-session`, config);
                } catch (error) {
                    // --- THIS IS THE FIX ---
                    // console.error("Session validation failed.", error.response?.data?.message || error.message);
                    localStorage.removeItem('adminInfo');

                    // 1. Define the redirect function
                    const redirectToLogin = () => router.push('/gn-admin-portal');

                    // 2. Open the modal and pass the redirect function as the callback
                    openGenericModal(
                        "Session Expired", 
                        "Your session is invalid or has expired. Please log in again for security.", 
                        "error", 
                        redirectToLogin // This will run when the user clicks "OK"
                    );
                }
            };
            validateSession();
            hasValidatedSession.current = true;
        }
    }, [router, openGenericModal]); // Dependency array is simplified to run primarily on initial check

    // This hook handles automatic logout when the user intentionally closes the tab/browser.
    useEffect(() => {
        const handleBeforeUnload = () => {
            const adminInfoString = localStorage.getItem('adminInfo');
            if (adminInfoString) {
                const adminInfo = JSON.parse(adminInfoString);
                const token = adminInfo?.token;
                if (token) {
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
                    const logoutUrl = `${backendUrl}/api/admin/auth/logout`;
                    fetch(logoutUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                        keepalive: true
                    });
                }
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    const navItems = [
        { href: '/admin/users', icon: 'fa-users', label: 'Users' },
        { href: '/admin/inventory', icon: 'fa-warehouse', label: 'Inventory' },
        { href: '/admin/redemptions', icon: 'fa-box-open', label: 'Redemptions' },
        { href: '/admin/gamification', icon: 'fa-trophy', label: 'Gamification' },
        { href: '/admin/promos', icon: 'fa-tags', label: 'Promo Codes' },
        { href: '/admin/settings', icon: 'fa-cog', label: 'Settings' },
    ];

    const handleLogout = async () => {
        try {
            const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
            const token = adminInfo?.token;
            if (token) {
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
                await axios.post(`${backendUrl}/api/admin/auth/logout`, {}, config);
            }
        } catch (error) {
            console.error("Failed to log out session on backend:", error);
        } finally {
            localStorage.removeItem('adminInfo');
            router.push('/gn-admin-portal');
        }
    };

    const handleRefresh = () => {
        window.dispatchEvent(new CustomEvent('refreshAdminData'));
    };

    return (
        <div className={styles.adminLayoutWrapper}>
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>GoldNest Admin</div>
                <nav className={styles.sidebarNav}>
                    <ul>
                        {adminRole === 'superadmin' && (
                            <li>
                                <Link
                                    href="/admin/dashboard"
                                    className={classNames(styles.navLink, pathname === '/admin/dashboard' && styles.navLinkActive)}
                                >
                                    <i className="fas fa-tachometer-alt"></i>
                                    <span>Dashboard</span>
                                </Link>
                            </li>
                        )}
                        {navItems.map(item => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className={classNames(styles.navLink, pathname === item.href && styles.navLinkActive)}
                                >
                                    <i className={`fas ${item.icon}`}></i>
                                    <span>{item.label}</span>
                                </Link>
                            </li>
                        ))}
                        {adminRole === 'superadmin' && (
                            <li>
                                <Link
                                    href="/admin/management"
                                    className={classNames(styles.navLink, pathname === '/admin/management' && styles.navLinkActive)}
                                >
                                    <i className="fas fa-user-shield"></i>
                                    <span>Admin Management</span>
                                </Link>
                            </li>
                        )}
                        {adminRole === 'superadmin' && (
                            <li>
                                <Link
                                    href="/admin/management/history"
                                    className={classNames(styles.navLink, pathname === '/admin/management/history' && styles.navLinkActive)}
                                >
                                    <i className="fas fa-history"></i>
                                    <span>Admin History</span>
                                </Link>
                            </li>
                        )}
                    </ul>
                </nav>
                <div className={styles.sidebarFooter}>
                    <button onClick={handleRefresh} className={styles.refreshButton}>
                        <i className="fas fa-sync-alt"></i>
                        <span>Refresh Data</span>
                    </button>
                    <button onClick={handleLogout} className={styles.logoutButton}>
                        <i className="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            <main className={styles.mainContent}>
                {children}
            </main>
        </div>
    );
};

export default AdminLayout;
