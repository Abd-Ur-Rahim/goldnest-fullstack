// src/app/admin/management/page.jsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import styles from './Management.module.css';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SuccessModal from '../components/SuccessModal';
import PasswordConfirmModal from '../components/PasswordConfirmModal';

const formatDate = (dateString) => new Date(dateString).toLocaleString('en-GB');

const AdminManagementPage = () => {
    // Data states
    const [admins, setAdmins] = useState([]);
    const [actionLogs, setActionLogs] = useState([]);
    const [foundAdmin, setFoundAdmin] = useState(null);
    const [newAdmin, setNewAdmin] = useState({ firstName: '', lastName: '', email: '', nic: '', role: 'support' });
    
    // UI & General states
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();
    const [adminInfo, setAdminInfo] = useState(null);

    // Delete & Update states
    const [deleteQuery, setDeleteQuery] = useState('');
    const [isFinding, setIsFinding] = useState(false);
    const [findError, setFindError] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const [adminToDelete, setAdminToDelete] = useState(null);
    const [updatingRoleId, setUpdatingRoleId] = useState(null);
    
    // Modal states
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isConfirmingAction, setIsConfirmingAction] = useState(false);
    const [actionToConfirm, setActionToConfirm] = useState(null);

    const fetchData = useCallback(async (token) => {
        setLoading(true);
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
            const [adminsRes, logsRes] = await Promise.all([
                axios.get(`${backendUrl}/api/admin/management/accounts`, config),
                axios.get(`${backendUrl}/api/admin/management/actions`, config),
            ]);
            setAdmins(adminsRes.data);
            setActionLogs(logsRes.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const adminInfoFromStorage = JSON.parse(localStorage.getItem('adminInfo'));
        if (!adminInfoFromStorage?.token) {
            router.push('/gn-admin-portal');
        } else if (adminInfoFromStorage.role !== 'superadmin') {
            setError("Access Denied: You must be a Super Admin to view this page.");
            setLoading(false);
        } else {
            setAdminInfo(adminInfoFromStorage);
            fetchData(adminInfoFromStorage.token);
        }
    }, [router, fetchData]);
    useEffect(() => {
        const adminInfo = JSON.parse(localStorage.getItem('adminInfo'));
        
        const doRefresh = () => {
            if (adminInfo?.token) {
                console.log('Refresh event received, refetching data for Management page...');
                fetchData(adminInfo.token);
            }
        };

        window.addEventListener('refreshAdminData', doRefresh);

        return () => {
            window.removeEventListener('refreshAdminData', doRefresh);
        };
    }, [fetchData]);
    
    const handleInputChange = (e) => setNewAdmin(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setIsSaving(true); 
        setError(''); setSuccess('');
        try {
            const config = { headers: { Authorization: `Bearer ${adminInfo.token}` } };
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
            const { data } = await axios.post(`${backendUrl}/api/admin/management/accounts`, newAdmin, config);
            setAdmins(prev => [...prev, data]);
            setSuccess('New admin created! A setup email has been sent.');
            setIsSuccessModalOpen(true);
            setNewAdmin({ firstName: '', lastName: '', email: '', nic: '', role: 'support' });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create admin.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleFindAdmin = async (e) => {
        e.preventDefault();
        setIsFinding(true);
        setFindError('');
        setFoundAdmin(null);
        if (!deleteQuery) {
            setFindError('Please enter an NIC or Email to search.');
            setIsFinding(false);
            return;
        }
        try {
            const config = { headers: { Authorization: `Bearer ${adminInfo.token}` }, params: { query: deleteQuery } };
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
            const { data } = await axios.get(`${backendUrl}/api/admin/management/find-admin`, config);
            setFoundAdmin(data);
        } catch (err) {
            setFoundAdmin(null);
            setFindError(err.response?.data?.message || 'Error finding admin.');
        } finally {
            setIsFinding(false);
        }
    };

    const openDeleteConfirmation = (admin) => {
        setAdminToDelete(admin);
        setIsDeleteModalOpen(true);
    };
    const initiateDeleteAdmin = () => {
        if (!adminToDelete) return;
        
        // Close the first confirmation modal
        setIsDeleteModalOpen(false); 

        // Check the role
        if (adminInfo?.role === 'superadmin') {
            // Superadmins can proceed directly
            executeDeleteAdmin("SUPERADMIN_BYPASS");
        } else {
            // Other admins must confirm with a password
            setActionToConfirm(() => (password) => executeDeleteAdmin(password));
            setIsPasswordModalOpen(true);
        }
    };
    const executeDeleteAdmin = async (password) => {
        if (!adminToDelete) return;
        
        // This state is for the final API call spinner
        setIsConfirmingAction(true); 
        setError(''); 
        setSuccess('');

        try {
            const config = { 
                headers: { Authorization: `Bearer ${adminInfo.token}` },
                // Add the confirmation password to the request body
                data: { confirmationPassword: password } 
            };
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
            
            // Note: For DELETE requests with a body, axios requires this structure
            await axios.delete(`${backendUrl}/api/admin/management/accounts/${adminToDelete._id}`, config);

            setAdmins(prevAdmins => prevAdmins.filter(admin => admin._id !== adminToDelete._id));
            setSuccess('Admin account deleted successfully.');
            setIsSuccessModalOpen(true);
            setFoundAdmin(null);
            setDeleteQuery('');

        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete admin account.');
        } finally {
            setIsConfirmingAction(false);
            setIsPasswordModalOpen(false); // Close the password modal
            setAdminToDelete(null);
            setActionToConfirm(null);
        }
    };

    // --- NEW: Handler to update an admin's role ---
    const handleRoleChange = async (adminId, newRole) => {
        setUpdatingRoleId(adminId);
        setError('');
        try {
            const config = { headers: { Authorization: `Bearer ${adminInfo.token}` } };
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
            await axios.put(`${backendUrl}/api/admin/management/accounts/${adminId}/role`, { role: newRole }, config);
            setAdmins(prevAdmins => 
                prevAdmins.map(admin => admin._id === adminId ? { ...admin, role: newRole } : admin)
            );
            setSuccess('Admin role updated successfully.');
            setIsSuccessModalOpen(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update role.');
            setTimeout(() => fetchData(adminInfo.token), 1000); // Re-fetch to revert dropdown on error
        } finally {
            setUpdatingRoleId(null);
        }
    };

    if (loading) return <div>Loading Management Console...</div>;
    if (error && !admins.length) return <div className="bg-red-100 text-red-700 p-4 rounded">{error}</div>;

    return (
        <>
            <div className={styles.pageWrapper}>
                <h1 className={styles.header}>Admin Management</h1>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-6">{error}</p>}

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>Create New Admin User</h2>
                    <form onSubmit={handleCreateAdmin} className={styles.createForm}>
                        <input name="firstName" value={newAdmin.firstName} onChange={handleInputChange} placeholder="First Name" required className={styles.formInput}/>
                        <input name="lastName" value={newAdmin.lastName} onChange={handleInputChange} placeholder="Last Name" required className={styles.formInput}/>
                        <input name="email" type="email" value={newAdmin.email} onChange={handleInputChange} placeholder="Email Address" required className={styles.formInput}/>
                        <input name="nic" value={newAdmin.nic} onChange={handleInputChange} placeholder="NIC Number" required className={styles.formInput}/>
                        {/* --- UPDATED: Added 'superadmin' option --- */}
                        <select name="role" value={newAdmin.role} onChange={handleInputChange} className={styles.formSelect}>
                            <option value="support">Support</option>
                            <option value="finance">Finance</option>
                            <option value="superadmin">Superadmin</option>
                        </select>
                        <button type="submit" disabled={isSaving} className={styles.createButton}>
                            {isSaving ? 'Creating...' : 'Create Admin'}
                        </button>
                    </form>
                </div>
                
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>Delete Admin by NIC or Email</h2>
                    <form onSubmit={handleFindAdmin} className={styles.deleteForm}>
                        <input 
                            type="text" 
                            value={deleteQuery}
                            onChange={(e) => setDeleteQuery(e.target.value)}
                            placeholder="Enter admin's NIC or Email..."
                            className={styles.formInput}
                        />
                        <button type="submit" disabled={isFinding} className={styles.findButton}>
                            {isFinding ? 'Searching...' : 'Find Admin'}
                        </button>
                    </form>
                    
                    {findError && <p className={styles.findErrorText}>{findError}</p>}
                    {foundAdmin && (
                        <div className={styles.foundAdminCard}>
                            <div className={styles.adminDetails}>
                                <p><strong>Name:</strong> {foundAdmin.firstName} {foundAdmin.lastName}</p>
                                <p><strong>Email:</strong> {foundAdmin.email}</p>
                                <p><strong>NIC:</strong> {foundAdmin.nic}</p>
                                <p><strong>Role:</strong> <span className={styles.roleBadge}>{foundAdmin.role}</span></p>
                            </div>
                            <button
                                onClick={() => openDeleteConfirmation(foundAdmin)}
                                disabled={deletingId === foundAdmin._id || (adminInfo && adminInfo._id === foundAdmin._id)}
                                className={styles.finalDeleteButton}
                            >
                                {deletingId === foundAdmin._id ? 'Deleting...' : 'Confirm and Delete This Admin'}
                            </button>
                            {adminInfo && adminInfo._id === foundAdmin._id && (
                                <p className={styles.findErrorText}>You cannot delete your own account.</p>
                            )}
                        </div>
                    )}
                </div>

                <div className={styles.widgetsGrid}>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Admin Accounts</h2>
                        <ul className={styles.list}>
                            {admins.map(admin => (
                                <li key={admin._id} className={styles.listItem}>
                                    <div>
                                        <p className={styles.name}>{`${admin.firstName} ${admin.lastName}`}</p>
                                        <p className={styles.email}>{admin.email}</p>
                                    </div>
                                    <div className={styles.actionsContainer}>
                                        {/* --- UPDATED: Role is now an interactive dropdown --- */}
                                        <select 
                                            value={admin.role}
                                            onChange={(e) => handleRoleChange(admin._id, e.target.value)}
                                            disabled={adminInfo && admin._id === adminInfo._id || updatingRoleId === admin._id}
                                            className={styles.roleSelect}
                                        >
                                            <option value="support">Support</option>
                                            <option value="finance">Finance</option>
                                            <option value="superadmin">Superadmin</option>
                                        </select>
                                        {updatingRoleId === admin._id && <i className="fas fa-spinner fa-spin"></i>}
                                        {adminInfo && admin._id !== adminInfo._id && (
                                            <button onClick={() => openDeleteConfirmation(admin)} disabled={deletingId === admin._id} className={styles.deleteButton} title="Delete Admin">
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            
            {isSuccessModalOpen && (<SuccessModal title="Success!" message={success} onClose={() => setIsSuccessModalOpen(false)} />)}
            {isDeleteModalOpen && (<ConfirmDeleteModal 
                    adminToDelete={adminToDelete} 
                    isDeleting={isConfirmingAction} 
                    onCancel={() => setIsDeleteModalOpen(false)} 
                    onConfirm={initiateDeleteAdmin} // <-- Use the new initiator function here
                />
            )}
            {isPasswordModalOpen && (<PasswordConfirmModal
                    onCancel={() => setIsPasswordModalOpen(false)}
                    onConfirm={actionToConfirm} // The execute function is stored here
                    isConfirming={isConfirmingAction}
                />
            )}
        </>
    );
};

export default AdminManagementPage;