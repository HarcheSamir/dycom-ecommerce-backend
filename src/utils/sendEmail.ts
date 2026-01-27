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
  const admins = ['Younesbbl87@outlook.fr'];
  // Link to Admin Dashboard Ticket Detail
  const adminTicketLink = `${FRONTEND_URL}/dashboard/admin/support?ticketId=${ticketId}`;

  try {
    await resend.emails.send({
      from: 'Dycom Support Bot <noreply@dycom-club.com>',
      to: admins,
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
  const admins = ['Younesbbl87@outlook.fr', 'harchesamir007@gmail.com'];
  const adminTicketLink = `${FRONTEND_URL}/dashboard/admin/support?ticketId=${ticketId}`;

  try {
    await resend.emails.send({
      from: 'Dycom Support Bot <noreply@dycom-club.com>',
      to: admins,
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