// services/emailService.js

const sgMail = require('@sendgrid/mail');
const dotenv = require('dotenv');
dotenv.config();

// This is the most important step: configuring SendGrid with your API key.
// It will now send emails via an HTTP API call, which is not blocked by Railway.
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- HELPER FUNCTION FOR ROBUST ERROR LOGGING ---
const logError = (error, context) => {
    console.error(`Error in ${context}:`, error.message);
    // SendGrid provides detailed errors in the response body, which is very helpful for debugging.
    if (error.response) {
        console.error('SendGrid Error Body:', JSON.stringify(error.response.body, null, 2));
    }
};


// --- REFACTORED EMAIL FUNCTIONS (API-BASED) ---

/**
 * Sends a verification OTP email using SendGrid.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} otp - The one-time password.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
const sendVerificationEmail = async (toEmail, otp) => {
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_FROM_EMAIL, // Use your verified SendGrid sender
        subject: 'Gold Nest - Verify Your Email Address',
        text: `Your Gold Nest email verification OTP is: ${otp}. It is valid for 10 minutes.`,
        html: `<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;"> <div style="max-width: 500px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1);"> <h2 style="text-align: center; color: #333;"> <img src="${process.env.FRONTEND_URL}/GoldNest.png" alt="Gold Nest Logo" style="max-width: 120px; display: block; margin: auto; margin-bottom: 10px;"></img> Gold Nest - Verify Your Email </h2> <p style="font-size: 16px; color: #555;">Hello,</p> <p style="font-size: 16px; color: #555;">Use the following OTP to verify your email address for your Gold Nest account:</p> <div style="font-size: 32px; font-weight: bold; color: #4CAF50; letter-spacing: 5px; text-align: center; margin: 20px 0; background-color: #e8f5e9; padding: 10px; border-radius: 5px;"> ${otp} </div> <p style="font-size: 14px; color: #777;">This OTP is valid for 10 minutes. Do not share it with anyone.</p> <p style="font-size: 14px; color: #555;">If you didn't request this, please ignore this email.</p> <p style="font-size: 14px; color: #555;">For assistance, contact us at <a href="mailto:${process.env.SENDGRID_FROM_EMAIL}" style="color: #4CAF50;">${process.env.SENDGRID_FROM_EMAIL}</a>.</p> <div style="text-align: center; font-size: 12px; color: #aaa; margin-top: 30px;">© ${new Date().getFullYear()} Gold Nest</div> </div> </body>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Verification Email sent to ${toEmail}`);
        return true;
    } catch (error) {
        logError(error, `sending verification email to ${toEmail}`);
        return false;
    }
};

/**
 * Sends a password reset email using SendGrid.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} resetToken - The password reset token.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
const sendPasswordResetEmail = async (toEmail, resetToken) => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Gold Nest - Reset Your Password',
        text: `You requested a password reset for your Gold Nest account. Click the link below to reset it:\n\n${resetUrl}\n\nThis link is valid for 10 minutes. If you did not request this, please ignore this email.`,
        html: `<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;"> <div style="max-width: 500px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1);"> <h2 style="text-align: center; color: #333;"> <img src="${process.env.FRONTEND_URL}/GoldNest.png" alt="Gold Nest Logo" style="max-width: 120px; display: block; margin: auto; margin-bottom: 10px;"> Gold Nest - Reset Your Password </h2> <p style="font-size: 16px; color: #555;">Hello,</p> <p style="font-size: 16px; color: #555;">You requested a password reset. Click the button below to set a new password:</p> <div style="text-align: center; margin: 30px 0;"> <a href="${resetUrl}" style="background-color: #fbbf24; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">Reset Password</a> </div> <p style="font-size: 14px; color: #777;">This link is valid for 10 minutes. If you cannot click the button, copy and paste this URL into your browser: ${resetUrl}</p> <p style="font-size: 14px; color: #555;">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p> <p style="font-size: 14px; color: #555;">For assistance, contact us at <a href="mailto:${process.env.SENDGRID_FROM_EMAIL}" style="color: #4CAF50;">${process.env.SENDGRID_FROM_EMAIL}</a>.</p> <div style="text-align: center; font-size: 12px; color: #aaa; margin-top: 30px;">© ${new Date().getFullYear()} Gold Nest</div> </div> </body>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Password Reset Email sent to ${toEmail}`);
        return true;
    } catch (error) {
        logError(error, `sending password reset to ${toEmail}`);
        return false;
    }
};

/**
 * Sends a welcome and password setup email to a new admin using SendGrid.
 * @param {string} toEmail - The new admin's email address.
 * @param {string} resetToken - The password setup token.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
const sendAdminSetupEmail = async (toEmail, resetToken) => {
    const setupUrl = `${process.env.FRONTEND_URL}/admin-password-setup/${resetToken}`;
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: 'Welcome to GoldNest - Set Up Your Admin Account',
        html: `<body style="font-family: Arial, sans-serif; padding: 30px;"> <div style="max-width: 500px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px;"> <h2 style="text-align: center;">Welcome to the GoldNest Admin Panel</h2> <p>An administrator account has been created for you. Click the button below to set your password and log in. This link is valid for 24 hours.</p> <div style="text-align: center; margin: 30px 0;"> <a href="${setupUrl}" style="background-color: #1a202c; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">Set Your Password</a> </div> <p style="font-size: 14px;">If you did not expect this, please ignore this email.</p> </div> </body>`
    };

    try {
        await sgMail.send(msg);
        console.log(`Admin setup email sent to ${toEmail}`);
        return true;
    } catch (error) {
        logError(error, `sending admin setup to ${toEmail}`);
        return false;
    }
};

/**
 * Sends a generic notification email using SendGrid.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} subject - The email subject.
 * @param {string} message - The main content/message of the email.
 * @param {string|null} link - An optional relative or absolute URL for a call-to-action button.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
const sendGenericNotificationEmail = async (toEmail, subject, message, link = null) => {
    let htmlContent = `<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;"> <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1);"> <h2 style="text-align: center; color: #333;"> <img src="${process.env.FRONTEND_URL}/GoldNest.png" alt="Gold Nest Logo" style="max-width: 120px; display: block; margin: auto; margin-bottom: 10px;"> Gold Nest Notification </h2> <h3 style="color: #333;">${subject}</h3> <p style="font-size: 16px; color: #555; white-space: pre-wrap;">${message}</p>`;
    
    let plainTextLink = '';

    if (link) {
        let fullLink = link.startsWith('http') ? link : `${process.env.FRONTEND_URL}${link.startsWith('/') ? '' : '/'}${link}`;
        htmlContent += `<div style="text-align: center; margin: 30px 0;"> <a href="${fullLink}" style="background-color: #F8B612; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">View Details</a> </div>`;
        plainTextLink = `\n\nView Details: ${fullLink}`;
    }

    htmlContent += `<p style="font-size: 14px; color: #555;">For assistance, contact us at <a href="mailto:${process.env.SENDGRID_FROM_EMAIL}" style="color: #4CAF50;">${process.env.SENDGRID_FROM_EMAIL}</a>.</p> <div style="text-align: center; font-size: 12px; color: #aaa; margin-top: 30px;">© ${new Date().getFullYear()} Gold Nest</div> </div> </body>`;
    
    const msg = {
        to: toEmail,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject: `Gold Nest: ${subject}`,
        text: `${subject}\n\n${message}${plainTextLink}`,
        html: htmlContent
    };

    try {
        await sgMail.send(msg);
        console.log(`Generic Notification Email sent to ${toEmail}: ${subject}`);
        return true;
    } catch (error) {
        logError(error, `sending generic notification to ${toEmail}`);
        return false;
    }
};

// --- EXPORT ALL FUNCTIONS ---
module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAdminSetupEmail,
    sendGenericNotificationEmail
};