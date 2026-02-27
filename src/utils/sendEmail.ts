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

/**
 * Sends a welcome email to new Hotmart users with a link to set their password.
 * The token is permanent (no expiry).
 */
export const sendWelcomeWithPasswordSetup = async (
  email: string,
  firstName: string,
  token: string
) => {
  const setupLink = `${FRONTEND_URL}/set-password?token=${token}`;

  try {
    const response = await resend.emails.send({
      from: 'Dycom Club <noreply@dycom-club.com>',
      to: [email],
      subject: '🎉 Bienvenue chez Dycom Club - Finalisez votre compte',
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f8f9fa;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; text-align: center;">
            <img src="https://dycom-club.com/logo2.png" alt="Dycom Club" style="height: 50px; margin-bottom: 30px;" />
            
            <h1 style="color: #ffffff !important; font-size: 28px; margin-bottom: 15px;">Bienvenue ${firstName} ! 🎉</h1>
            
            <p style="color: #b8c1cc !important; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              Votre paiement a été confirmé et votre accès à vie à Dycom Club est maintenant activé !
            </p>

            <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 25px; margin-bottom: 30px;">
              <p style="color: #ffffff !important; font-size: 16px; margin-bottom: 20px;">
                <strong>Dernière étape :</strong> Créez votre mot de passe pour accéder à votre espace membre.
              </p>
              
              <a href="${setupLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Créer mon mot de passe
              </a>
            </div>

            <p style="color: #8892a0; font-size: 14px;">
              Ce lien est personnel et permanent. Conservez-le précieusement.
            </p>
          </div>

          <div style="text-align: center; padding-top: 30px;">
            <p style="color: #6b7280; font-size: 12px;">
              © ${new Date().getFullYear()} Dycom Club. Tous droits réservés.
            </p>
          </div>
        </div>
      `
    });

    if (response.error) {
      console.error('Resend Error (Welcome):', response.error);
      return { success: false, error: response.error };
    }
    console.log(`✅ Welcome email sent to ${email}`);
    return { success: true, id: response.data?.id };
  } catch (error) {
    console.error('Resend Execution Error (Welcome):', error);
    return { success: false, error };
  }
};

/**
 * Sends a verification email when user requests to change their email address.
 */
export const sendEmailChangeVerification = async (
  newEmail: string,
  verificationCode: string,
  firstName: string
) => {
  try {
    const response = await resend.emails.send({
      from: 'Security <noreply@dycom-club.com>',
      to: [newEmail],
      subject: 'Verify Your New Email Address',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; background-color: #f9fafb;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            
            <!-- Header -->
            <div style="background-color: #111317; padding: 30px; text-align: center;">
               <h2 style="color: #ffffff; margin: 0;">Dycom Club</h2>
            </div>

            <!-- Body -->
            <div style="padding: 30px;">
              <h2 style="color: #111317; margin-top: 0;">Verify Your New Email</h2>
              <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                Hi ${firstName},
              </p>
              <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                You requested to change your email address to this one. Please use the verification code below to confirm:
              </p>

              <!-- Code Box -->
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your verification code:</p>
                <h1 style="letter-spacing: 8px; font-size: 36px; margin: 0; color: #111317;">${verificationCode}</h1>
              </div>

              <p style="font-size: 14px; color: #6b7280; text-align: center;">
                This code expires in <strong>1 hour</strong>.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                If you didn't request this change, please ignore this email. Your current email will remain unchanged.
              </p>
            </div>
          </div>
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



/**
 * Sends a purchase confirmation email with training access and invoice link.
 */
/**
 * Sends a purchase confirmation email with training access and invoice link.
 */
export const sendPurchaseConfirmationEmail = async (
  email: string,
  firstName: string,
  itemName: string,
  amount: number,
  currency: string,
  invoiceUrl: string | null
) => {
  const dashboardLink = `${FRONTEND_URL}/dashboard`;
  // Fallback if currency is missing to avoid crashes
  const safeCurrency = currency || 'USD';
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency.toUpperCase() }).format(amount);

  try {
    const response = await resend.emails.send({
      from: 'Dycom Club <noreply@dycom-club.com>',
      to: [email],
      subject: 'Payment Confirmation & Access',
      html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; background-color: #f9fafb;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              
              <!-- Header -->
              <div style="background-color: #111317; padding: 30px; text-align: center;">
                 <h2 style="color: #ffffff; margin: 0;">Dycom Club</h2>
              </div>
  
              <!-- Body -->
              <div style="padding: 30px;">
                <h2 style="color: #111317; margin-top: 0;">Payment Successful!</h2>
                <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                  Hi ${firstName},
                </p>
                <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                  Thank you for your purchase. We have successfully received your payment for <strong>${itemName}</strong>.
                </p>
  
                <!-- Order Summary -->
                <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Amount Paid</td>
                      <td style="padding: 5px 0; color: #111317; font-weight: bold; text-align: right;">${formattedAmount}</td>
                    </tr>
                    <tr>
                      <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Plan / Item</td>
                      <td style="padding: 5px 0; color: #111317; font-weight: bold; text-align: right;">${itemName}</td>
                    </tr>
                  </table>
                </div>
  
                <!-- CTA -->
                <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                  <a href="${dashboardLink}" style="background-color: #7F56D9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Access Dashboard & Training
                  </a>
                </div>
  
                ${invoiceUrl ? `
                <p style="text-align: center; font-size: 14px; color: #6b7280;">
                  Need a receipt? <a href="${invoiceUrl}" style="color: #7F56D9; text-decoration: underline;">Download Invoice</a>
                </p>
                ` : ''}
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
                
                <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                  If you have any questions, reply to this email or contact support.
                </p>
              </div>
            </div>
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


export const sendTicketCreatedEmail = async (email: string, name: string, ticketId: string, accessToken: string, subject: string) => {

  const ticketLink = `${FRONTEND_URL}/support/ticket/${ticketId}?key=${accessToken}`;

  try {
    await resend.emails.send({
      from: 'Support <support@dycom-club.com>',
      to: [email],
      subject: `[Ticket #${ticketId.slice(0, 8)}] Received: ${subject}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Ticket Received</h2>
          <p>Hi ${name},</p>
          <p>We have received your support request regarding "<strong>${subject}</strong>".</p>
          <p>Our team will review it shortly. You can check the status or add more details by clicking the link below:</p>
          <a href="${ticketLink}" style="background-color: #7F56D9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Ticket</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">Ticket ID: ${ticketId}</p>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send Ticket Created Email:', error);
  }
};

/**
 * Sends a notification when an Admin replies to a ticket.
 */
export const sendTicketReplyEmail = async (email: string, name: string, ticketId: string, accessToken: string, previewMessage: string) => {
  const ticketLink = `${FRONTEND_URL}/support/ticket/${ticketId}?key=${accessToken}`;

  try {
    await resend.emails.send({
      from: 'Support <support@dycom-club.com>',
      to: [email],
      subject: `[Ticket #${ticketId.slice(0, 8)}] New Reply`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>New Reply from Support</h2>
          <p>Hi ${name},</p>
          <p>A member of our team has replied to your ticket:</p>
          <blockquote style="border-left: 4px solid #7F56D9; padding-left: 15px; background: #f9f9f9; padding: 10px;">
            ${previewMessage.length > 200 ? previewMessage.substring(0, 200) + '...' : previewMessage}
          </blockquote>
          <a href="${ticketLink}" style="background-color: #7F56D9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Reply to Ticket</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send Ticket Reply Email:', error);
  }
};

/**
 * Sends a confirmation email for a Shop Order payment.
 */
export const sendShopOrderConfirmationEmail = async (
  email: string,
  firstName: string,
  orderId: string,
  tierName: string,
  amount: number,
  currency: string
) => {
  // Determine user link (usually just the dashboard or orders page)
  const ordersLink = `${FRONTEND_URL}/dashboard/order-shop`;
  const formattedAmount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(amount);

  try {
    const response = await resend.emails.send({
      from: 'Dycom Club <noreply@dycom-club.com>',
      to: [email],
      subject: 'Confirmation de votre commande de boutique',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; background-color: #f9fafb;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            
            <!-- Header -->
            <div style="background-color: #111317; padding: 30px; text-align: center;">
               <h2 style="color: #ffffff; margin: 0;">Dycom Club</h2>
            </div>

            <!-- Body -->
            <div style="padding: 30px;">
              <h2 style="color: #111317; margin-top: 0;">Paiement reçu !</h2>
              <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                Bonjour ${firstName},
              </p>
              <p style="font-size: 16px; line-height: 1.5; color: #4b5563;">
                Nous avons bien reçu votre paiement pour la création de votre boutique. Notre équipe va commencer à travailler sur votre projet dès maintenant.
              </p>

              <!-- Order Summary -->
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Montant payé</td>
                    <td style="padding: 5px 0; color: #111317; font-weight: bold; text-align: right;">${formattedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">Formule</td>
                    <td style="padding: 5px 0; color: #111317; font-weight: bold; text-align: right;">${tierName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280; font-size: 14px;">N° Commande</td>
                    <td style="padding: 5px 0; color: #111317; font-weight: bold; text-align: right;">#${orderId.slice(0, 8)}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                <a href="${ordersLink}" style="background-color: #7F56D9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                  Voir ma commande
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                Si vous avez des questions, n'hésitez pas à répondre directement à cet email.
              </p>
            </div>
          </div>
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

import { ADMIN_EMAILS } from '../config/adminEmails';

/**
 * Sends an alert to Admins when a NEW ticket is created.
 */
export const sendNewTicketAlertToAdmins = async (
  ticketId: string,
  subject: string,
  userEmail: string | null,
  userName: string | null,
  messagePreview: string
) => {
  const adminTicketLink = `${FRONTEND_URL}/dashboard/admin/support?ticketId=${ticketId}`;

  try {
    await resend.emails.send({
      from: 'Dycom Support Bot <noreply@dycom-club.com>',
      to: ADMIN_EMAILS,
      subject: `[New Ticket] ${subject}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #7F56D9;">New Support Ticket Created</h2>
          <p><strong>User:</strong> ${userName || 'Guest'} (${userEmail || 'No Email'})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 4px solid #ddd; padding-left: 15px; background: #f9f9f9; padding: 10px;">
            ${messagePreview.length > 300 ? messagePreview.substring(0, 300) + '...' : messagePreview}
          </blockquote>
          <br />
          <a href="${adminTicketLink}" style="background-color: #111317; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Open in Admin Panel</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send New Ticket Alert to Admins:', error);
  }
};

/**
 * Sends an alert to Admins when a USER replies to a ticket.
 */
export const sendTicketReplyAlertToAdmins = async (
  ticketId: string,
  userEmail: string | null,
  userName: string | null,
  messagePreview: string
) => {
  const adminTicketLink = `${FRONTEND_URL}/dashboard/admin/support?ticketId=${ticketId}`;

  try {
    await resend.emails.send({
      from: 'Dycom Support Bot <noreply@dycom-club.com>',
      to: ADMIN_EMAILS,
      subject: `[Ticket Reply] #${ticketId.slice(0, 8)} - New Message`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #007bff;">User Replied to Ticket</h2>
          <p><strong>User:</strong> ${userName || 'Guest'} (${userEmail || 'No Email'})</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 4px solid #007bff; padding-left: 15px; background: #f0f8ff; padding: 10px;">
            ${messagePreview.length > 300 ? messagePreview.substring(0, 300) + '...' : messagePreview}
          </blockquote>
          <br />
          <a href="${adminTicketLink}" style="background-color: #111317; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Conversation</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send Ticket Reply Alert to Admins:', error);
  }
};

/**
 * Sends an alert to Admins when a NEW Shop Order is created/paid.
 */
export const sendNewShopOrderAlertToAdmins = async (
  orderId: string,
  userEmail: string,
  userName: string,
  tierName: string,
  amount: number,
  currency: string
) => {
  const adminOrderLink = `${FRONTEND_URL}/dashboard/admin/shop-orders?orderId=${orderId}`;
  const formattedAmount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount / 100);

  try {
    await resend.emails.send({
      from: 'Dycom Shop Bot <noreply@dycom-club.com>',
      to: ADMIN_EMAILS,
      subject: `[New Order] ${tierName} - ${formattedAmount}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #10B981;">New Shop Order Received!</h2>
          <p><strong>Customer:</strong> ${userName} (${userEmail})</p>
          <p><strong>Product:</strong> ${tierName}</p>
          <p><strong>Amount:</strong> ${formattedAmount}</p>
          <p><strong>Order ID:</strong> #${orderId.slice(0, 8)}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <br />
          <a href="${adminOrderLink}" style="background-color: #10B981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Order Details</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send New Shop Order Alert to Admins:', error);
  }
};

/**
 * Sends an alert to Admins when a payment fails.
 */
export const sendPaymentFailedAlertToAdmins = async (
  userId: string,
  userEmail: string,
  userName: string,
  reason: string,
  context: string // e.g. "Subscription renewal", "Shop order"
) => {
  const adminUserLink = `${FRONTEND_URL}/dashboard/admin/users/${userId}`;

  try {
    await resend.emails.send({
      from: 'Dycom Payment Bot <noreply@dycom-club.com>',
      to: ADMIN_EMAILS,
      subject: `[Payment Failed] ${userName} - ${context}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #EF4444;">Payment Failed</h2>
          <p><strong>Customer:</strong> ${userName} (${userEmail})</p>
          <p><strong>Context:</strong> ${context}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <br />
          <a href="${adminUserLink}" style="background-color: #EF4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View User Profile</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send Payment Failed Alert to Admins:', error);
  }
};

/**
 * Sends an email to a user when their installment period has expired.
 * Their access has been suspended until they pay the next installment.
 */
export const sendInstallmentExpiredEmail = async (
  email: string,
  firstName: string
) => {
  const billingLink = `${FRONTEND_URL}/dashboard/billing`;
  const supportLink = `${FRONTEND_URL}/dashboard/support`;

  try {
    const response = await resend.emails.send({
      from: 'Dycom Club <noreply@dycom-club.com>',
      to: [email],
      subject: '⚠️ Votre accès a été suspendu - Paiement en retard',
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; background-color: #f9fafb;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            
            <!-- Header -->
            <div style="background-color: #111317; padding: 30px; text-align: center;">
               <h2 style="color: #ffffff; margin: 0;">Dycom Club</h2>
            </div>

            <!-- Body -->
            <div style="padding: 30px;">
              <div style="text-align: center; margin-bottom: 25px;">
                <div style="display: inline-block; background-color: #FEF2F2; border-radius: 50%; padding: 15px; margin-bottom: 15px;">
                  <span style="font-size: 32px;">⚠️</span>
                </div>
                <h2 style="color: #DC2626; margin: 0;">Paiement en retard</h2>
              </div>

              <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">
                Bonjour ${firstName},
              </p>
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">
                Votre période d'abonnement est arrivée à expiration et votre accès à Dycom Club a été temporairement suspendu.
              </p>
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563;">
                Pour restaurer votre accès, veuillez procéder au paiement de votre prochaine mensualité.
              </p>

              <!-- Alert Box -->
              <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
                <p style="color: #DC2626; font-weight: bold; margin: 0;">
                  Votre accès est suspendu jusqu'au prochain paiement.
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin-top: 30px; margin-bottom: 15px;">
                <a href="${billingLink}" style="background-color: #7F56D9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                  Voir ma facturation
                </a>
              </div>
              <div style="text-align: center; margin-bottom: 30px;">
                <a href="${supportLink}" style="color: #7F56D9; text-decoration: underline; font-size: 14px;">
                  Contacter le support
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                Si vous avez déjà effectué le paiement, veuillez contacter notre support pour résoudre ce problème.
              </p>
            </div>
          </div>
        </div>
      `
    });

    if (response.error) {
      console.error('Resend Error (Installment Expired):', response.error);
      return { success: false, error: response.error };
    }
    console.log(`⚠️ Installment expired email sent to ${email}`);
    return { success: true, id: response.data?.id };
  } catch (error) {
    console.error('Resend Execution Error (Installment Expired):', error);
    return { success: false, error };
  }
};

/**
 * Sends an alert to Admins when a new user signs up.
 */
export const sendNewUserSignupAlertToAdmins = async (
  userId: string,
  userEmail: string,
  firstName: string,
  lastName: string
) => {
  const adminUserLink = `${FRONTEND_URL}/dashboard/admin/users/${userId}`;

  try {
    await resend.emails.send({
      from: 'Dycom User Bot <noreply@dycom-club.com>',
      to: ADMIN_EMAILS,
      subject: `[New User] ${firstName} ${lastName} just signed up!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #8B5CF6;">New User Registration</h2>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('fr-FR')}</p>
          <br />
          <a href="${adminUserLink}" style="background-color: #8B5CF6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View User Profile</a>
        </div>
      `
    });
  } catch (error) {
    console.error('Failed to send New User Signup Alert to Admins:', error);
  }
};