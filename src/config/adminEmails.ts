// Centralized admin email configuration
// Add emails to ADMIN_EMAILS env var as comma-separated list, or modify the default below

export const ADMIN_EMAILS: string[] = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
    : ['Younesbbl87@outlook.fr'];
