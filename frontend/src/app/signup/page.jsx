// src/app/signup/page.jsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useModal } from '@/contexts/ModalContext'; // This import is crucial
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// Assume icons are in public
const logoSrc = "/GoldNest.png";
const googleIconSrc = "/google-icon.png";
const appleIconSrc = "/apple-icon.png";

export default function SignupPage() {
  const { openLoginModal, openGenericModal } = useModal(); // Added openGenericModal
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', city: '', nic: '', password: '', confirmPassword: ''
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleCheckboxChange = (e) => setTermsAccepted(e.target.checked);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.'); return;
    }
    if (formData.password.length < 8) {
        setError('Password must be at least 8 characters.'); return;
    }
    if (!termsAccepted) {
      setError('You must accept the Terms of Service & Privacy Policy.'); return;
    }

    setLoading(true);
    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      // Destructure only needed fields for API call
      const { name, email, password, phone, nic, address, city } = formData;
      const { data } = await axios.post(
        `${backendUrl}/api/auth/register`,
        { name, email, password, phone, nic, address, city },
          config
      );

      // --- SUCCESS ---
      setLoading(false);
      // Show success message & redirect to verification page
      console.log('Registration successful, redirecting to verify:', data);
      // Pass userId and email to the verification page via query parameters
      router.push(`/verify-email?userId=${data.userId}&email=${encodeURIComponent(email)}`);

    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed. Please try again.');
    }
  };

  // REPLACED ALERTS
  const handleGoogleSignIn = () => {
    openGenericModal(
      'Feature Not Available',
      'Google Sign-Up not implemented yet. Please use the form to sign up.',
      'info'
    );
  };
  const handleAppleSignIn = () => {
    openGenericModal(
      'Feature Not Available',
      'Apple Sign-Up not implemented yet. Please use the form to sign up.',
      'info'
    );
  };

  return (
    <>
      <Navbar /> {/* ADD NAVBAR */}

      {/* Use class names from styles.css */}
       <div className="auth-container">
          <div className="logo">
              <Image src={logoSrc} alt="GoldNest Logo" width={120} height={35} />
          </div>
          <h2>Welcome to GoldNest</h2>
          {error && <p id="signup-error" className="error">{error}</p>}

          <form id="signup-form" className="form" onSubmit={handleSignup}>
              <label htmlFor="name">Your name</label>
              <input type="text" id="name" name="name" placeholder="First & last" required value={formData.name} onChange={handleChange} />
              <label htmlFor="email">Email</label>
              <input type="email" id="email" name="email" placeholder="abc@example.com" required value={formData.email} onChange={handleChange} />
              <label htmlFor="phone">Phone number</label>
              <input type="tel" id="phone" name="phone" placeholder="07xxxxxxxx" required value={formData.phone} onChange={handleChange} />
              <label htmlFor="address">Address</label>
              <input type="text" id="address" name="address" required value={formData.address} onChange={handleChange} />
              <label htmlFor="city">City</label>
              <input type="text" id="city" name="city" required value={formData.city} onChange={handleChange} />
              <label htmlFor="nic">NIC number</label>
              <input type="text" id="nic" name="nic" required value={formData.nic} onChange={handleChange} />
              <label htmlFor="password">Password</label>
              <input type="password" id="password" name="password" placeholder="At least 8 characters" required value={formData.password} onChange={handleChange} />
              <label htmlFor="confirm-password">Re-enter password</label>
              <input type="password" id="confirm-password" name="confirmPassword" required value={formData.confirmPassword} onChange={handleChange}/>

              <div className="terms">
                  <input type="checkbox" id="terms" name="termsAccepted" checked={termsAccepted} onChange={handleCheckboxChange} />
                  <label htmlFor="terms">
                        By creating an account you agree to our{' '}
                        <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link> &{' '}
                        <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
                  </label>
              </div>
              <button type="submit" className="submit-btn" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Create'}
              </button>
          </form>

          <div className="divider center-divider">or</div>
          <button className="social-btn" onClick={handleGoogleSignIn}>
              <Image src={googleIconSrc} alt="Google" width={20} height={20}/> Sign up with Google
          </button>
          <button className="social-btn" onClick={handleAppleSignIn}>
              <Image src={appleIconSrc} alt="Apple" width={20} height={20}/> Sign up with Apple
          </button>
          <p className="switch-auth">
              Already have an account?{' '}
                {/* Use button to trigger modal */}
                <button
                  type="button"
                  onClick={openLoginModal}
                  className="link-btn"
                >
                  Log In
                </button>
          </p>
        </div>

      <Footer /> {/* ADD FOOTER */}
    </>
  );
}