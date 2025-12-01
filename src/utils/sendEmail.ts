// src/utils/sendEmail.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dycom-club.com'; 

export const sendOtpEmail = async (email: string, otpCode: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.error("Resend API Key missing");
    return { success: false };
  }

  try {
    const response = await resend.emails.send({
      from: 'Security <noreply@dycom-club.com>',
      to: [email],
      subject: 'Admin Login Verification',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Admin Login Verification</h2>
          <p>You requested access to the Dycom Admin Panel.</p>
          <p>Your code is:</p>
          <h1 style="letter-spacing: 5px; background: #eee; padding: 10px; display: inline-block;">${otpCode}</h1>
          <p>This code expires in 5 minutes.</p>
        </div>
      `
    });

    // FIX: Check for error in the response object
    if (response.error) {
        console.error('Resend returned an error:', response.error);
        return { success: false, error: response.error };
    }

    // FIX: Access .id safely through response.data
    return { success: true, id: response.data?.id };

  } catch (error) {
    console.error('Resend Execution Error:', error);
    return { success: false, error };
  }
};


export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

  try {
    const response = await resend.emails.send({
      from: 'Security <noreply@dycom-club.com>',
      to: [email],
      subject: 'Reset Your Password',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password for Dycom Club.</p>
          <p>Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="background-color: #7F56D9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Reset Password</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

    if (response.error) {
        console.error('Resend Error:', response.error);
        return { success: false, error: response.error };
    }
    return { success: true, id: response.data?.id };
  } catch (error) {
    console.error('Resend Execution Error:', error);
    return { success: false, error };
  }
};