import { Request, Response } from 'express';
import { prisma } from '../../index';
import { Resend } from 'resend';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dycom-club.com';

/**
 * Wraps the admin's HTML content in a branded Dycom email template.
 */
function wrapInEmailTemplate(htmlContent: string, subject: string): string {
    return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px 0; color: #333; background-color: #f9fafb;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background-color: #111317; padding: 30px; text-align: center;">
          <img src="https://dycom-club.com/logo2.png" alt="Dycom Club" style="height: 40px; margin: 0 auto; display: block;" />
        </div>

        <!-- Body -->
        <div style="padding: 30px;">
          ${htmlContent}
        </div>

        <!-- Footer -->
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            © ${new Date().getFullYear()} Dycom Club. Tous droits réservés.
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin: 5px 0 0 0;">
            <a href="${FRONTEND_URL}" style="color: #9ca3af; text-decoration: none;">dycom-club.com</a>
          </p>
          <p style="font-size: 11px; color: #9ca3af; margin: 15px 0 0 0;">
            Vous ne souhaitez plus recevoir ces annonces ? <a href="mailto:support@dycom-club.com?subject=Désinscription" style="color: #9ca3af; text-decoration: underline;">Se désinscrire</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Helper: send emails in batches of 50 with delay between batches.
 */
async function sendInBatches(
    emails: { from: string; to: string; subject: string; html: string }[],
    batchSize = 50,
    delayMs = 300
): Promise<{ sent: number; errors: string[] }> {
    let sent = 0;
    const errors: string[] = [];

    for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);

        try {
            const result = await resend.batch.send(batch);
            if (result.error) {
                errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${result.error.message}`);
            } else {
                sent += batch.length;
            }
        } catch (err: any) {
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${err.message || 'Unknown error'}`);
        }

        // Delay between batches to avoid rate limits
        if (i + batchSize < emails.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return { sent, errors };
}

/**
 * POST /api/admin/newsletter/send
 * Sends a newsletter email to the selected audience.
 */
export const sendNewsletter = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { subject, htmlContent, audience, specificEmails } = req.body;

        if (!subject || !htmlContent) {
            return res.status(400).json({ error: 'Subject and content are required.' });
        }

        const validAudiences = ['ALL', 'ACTIVE', 'LIFETIME', 'SMMA', 'SPECIFIC'];
        const selectedAudience = validAudiences.includes(audience) ? audience : 'ALL';

        // Build the base user query based on audience
        let whereClause: any = {};
        let isSpecific = selectedAudience === 'SPECIFIC';

        if (!isSpecific) {
            switch (selectedAudience) {
                case 'ACTIVE':
                    whereClause = { subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] } };
                    break;
                case 'LIFETIME':
                    whereClause = { subscriptionStatus: 'LIFETIME_ACCESS' };
                    break;
                case 'SMMA':
                    whereClause = { subscriptionStatus: 'SMMA_ONLY' };
                    break;
                case 'ALL':
                default:
                    whereClause = {};
                    break;
            }
            whereClause.email = { not: { startsWith: 'usertest' } };
        }

        // Prepare recipient list
        let recipients: { email: string }[] = [];

        // 1. Add base audience if not specific
        if (!isSpecific) {
            recipients = await prisma.user.findMany({
                where: whereClause,
                select: { email: true },
            });
        }

        // 2. Add specific emails if selected
        if (isSpecific && Array.isArray(specificEmails)) {
            recipients = specificEmails.filter(e => e).map(email => ({ email: email.trim().toLowerCase() }));
        }

        // 3. Always fetch and add admins
        const admins = await prisma.user.findMany({
            where: { accountType: 'ADMIN', email: { not: { startsWith: 'usertest' } } },
            select: { email: true },
        });

        // Combine and deduplicate by email
        const allEmails = new Set<string>();
        for (const r of [...recipients, ...admins]) {
            if (r.email) {
                allEmails.add(r.email.toLowerCase());
            }
        }

        const uniqueRecipients = Array.from(allEmails).map(email => ({ email }));

        if (uniqueRecipients.length === 0) {
            return res.status(400).json({ error: 'No recipients found.' });
        }

        // Wrap content in branded template
        const wrappedHtml = wrapInEmailTemplate(htmlContent, subject);

        // Prepare email objects
        const emailPayloads = uniqueRecipients.map((user) => ({
            from: 'Dycom Club <noreply@dycom-club.com>',
            to: user.email,
            subject,
            html: wrappedHtml,
        }));

        // Send in batches
        const { sent, errors } = await sendInBatches(emailPayloads);

        // Save to database
        const newsletter = await prisma.newsletter.create({
            data: {
                subject,
                htmlContent,
                audience: selectedAudience,
                recipientCount: sent,
                sentBy: req.user!.userId,
            },
        });

        console.log(`📧 Newsletter "${subject}" sent to ${sent}/${uniqueRecipients.length} recipients by admin ${req.user!.userId} (Admins included)`);

        return res.json({
            success: true,
            newsletterId: newsletter.id,
            totalRecipients: uniqueRecipients.length,
            totalSent: sent,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Newsletter send error:', error);
        return res.status(500).json({ error: 'Failed to send newsletter.' });
    }
};

/**
 * GET /api/admin/newsletter/history
 * Returns paginated list of sent newsletters.
 */
export const getNewsletterHistory = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [newsletters, total] = await Promise.all([
            prisma.newsletter.findMany({
                skip,
                take: limit,
                orderBy: { sentAt: 'desc' },
                include: {
                    sender: {
                        select: { firstName: true, lastName: true, email: true },
                    },
                },
            }),
            prisma.newsletter.count(),
        ]);

        return res.json({
            data: newsletters,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('Newsletter history error:', error);
        return res.status(500).json({ error: 'Failed to fetch newsletter history.' });
    }
};

/**
 * GET /api/admin/newsletter/recipient-count
 * Returns the count of recipients for a given audience.
 */
export const getRecipientCount = async (req: Request, res: Response) => {
    try {
        const audience = (req.query.audience as string) || 'ALL';

        if (audience === 'SPECIFIC') {
            // Specific count is dynamic based on user input, returning 0 because the frontend handles this
            return res.json({ count: 0 });
        }

        let whereClause: any = {};
        switch (audience) {
            case 'ACTIVE':
                whereClause = { subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] } };
                break;
            case 'LIFETIME':
                whereClause = { subscriptionStatus: 'LIFETIME_ACCESS' };
                break;
            case 'SMMA':
                whereClause = { subscriptionStatus: 'SMMA_ONLY' };
                break;
            case 'ALL':
            default:
                whereClause = {};
                break;
        }

        whereClause.email = { not: { startsWith: 'usertest' } };

        // Get the base audience
        const baseUsers = await prisma.user.findMany({
            where: whereClause,
            select: { email: true }
        });

        // Get admins
        const admins = await prisma.user.findMany({
            where: { accountType: 'ADMIN', email: { not: { startsWith: 'usertest' } } },
            select: { email: true }
        });

        // Deduplicate to get exact count
        const uniqueEmails = new Set([...baseUsers.map(u => u.email), ...admins.map(a => a.email)]);

        return res.json({ count: uniqueEmails.size });
    } catch (error: any) {
        console.error('Recipient count error:', error);
        return res.status(500).json({ error: 'Failed to count recipients.' });
    }
};
