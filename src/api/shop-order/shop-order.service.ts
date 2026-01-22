// src/api/shop-order/shop-order.service.ts

import { PrismaClient, ShopOrderStatus, PaymentStatus, PricingTier } from '@prisma/client';

const prisma = new PrismaClient();

// Pricing configuration
const PRICING = {
    TIER_1: { min: 1, max: 3, price: 299 },
    TIER_2: { min: 4, max: 10, price: 599 },
    QUOTE: { min: 11, max: Infinity, price: null }
};

export const shopOrderService = {
    /**
     * Calculate pricing tier based on product count
     */
    calculatePricingTier(productCount: number): { tier: PricingTier; price: number | null } {
        if (productCount >= PRICING.TIER_1.min && productCount <= PRICING.TIER_1.max) {
            return { tier: 'TIER_1', price: PRICING.TIER_1.price };
        } else if (productCount >= PRICING.TIER_2.min && productCount <= PRICING.TIER_2.max) {
            return { tier: 'TIER_2', price: PRICING.TIER_2.price };
        } else {
            return { tier: 'QUOTE', price: null };
        }
    },

    /**
     * Get or create a draft order for a user
     * Also returns PENDING_PAYMENT orders so users can resume payment
     */
    async getOrCreateDraft(userId: string) {
        // First, check for any PENDING_PAYMENT order (payment attempt failed/abandoned)
        let order = await prisma.shopOrder.findFirst({
            where: {
                userId,
                status: 'PENDING_PAYMENT'
            },
            include: {
                files: true
            },
            orderBy: { updatedAt: 'desc' }
        });

        // If no pending payment, look for a draft
        if (!order) {
            order = await prisma.shopOrder.findFirst({
                where: {
                    userId,
                    status: 'DRAFT'
                },
                include: {
                    files: true
                }
            });
        }

        // Create new draft if nothing exists
        if (!order) {
            order = await prisma.shopOrder.create({
                data: {
                    userId,
                    status: 'DRAFT'
                },
                include: {
                    files: true
                }
            });
        }

        return order;
    },

    /**
     * Save draft order (autosave)
     * Also allows editing PENDING_PAYMENT orders (for retry after failed payment)
     */
    async saveDraft(userId: string, orderId: string, data: any) {
        // Verify order belongs to user and is editable (DRAFT or PENDING_PAYMENT)
        const existingOrder = await prisma.shopOrder.findFirst({
            where: {
                id: orderId,
                userId,
                status: { in: ['DRAFT', 'PENDING_PAYMENT'] }
            }
        });

        if (!existingOrder) {
            throw new Error('Order not found or not editable');
        }

        // Calculate pricing tier if product count changed
        let pricingData = {};
        if (data.productCount !== undefined) {
            const { tier, price } = this.calculatePricingTier(data.productCount);
            pricingData = { pricingTier: tier, totalPrice: price };
        }

        // Update order with new data
        const updatedOrder = await prisma.shopOrder.update({
            where: { id: orderId },
            data: {
                ...data,
                ...pricingData,
                updatedAt: new Date()
            },
            include: {
                files: true
            }
        });

        return updatedOrder;
    },

    /**
     * Get trending products for selection (Step 3)
     */
    async getTrendingProducts(limit: number = 4) {
        const products = await prisma.winningProduct.findMany({
            orderBy: { salesVolume: 'desc' },
            take: limit,
            select: {
                id: true,
                productId: true,
                title: true,
                imageUrl: true,
                price: true,
                currency: true,
                salesVolume: true,
                categoryName: true
            }
        });

        return products;
    },

    /**
     * Add file to order
     */
    async addFile(orderId: string, fileData: {
        fileName: string;
        fileUrl: string;
        fileType: string;
        mimeType?: string;
        fileSize?: number;
        cloudinaryId?: string;
    }) {
        return prisma.shopOrderFile.create({
            data: {
                orderId,
                ...fileData
            }
        });
    },

    /**
     * Delete file from order
     */
    async deleteFile(orderId: string, fileId: string) {
        return prisma.shopOrderFile.delete({
            where: {
                id: fileId,
                orderId
            }
        });
    },

    /**
     * Submit order after payment
     */
    async submitOrder(userId: string, orderId: string) {
        const order = await prisma.shopOrder.findFirst({
            where: {
                id: orderId,
                userId
            },
            include: {
                files: true,
                user: true
            }
        });

        if (!order) {
            throw new Error('Order not found');
        }

        // For QUOTE tier, no payment required - just submit
        // For TIER_1 and TIER_2, verify payment status
        if (order.pricingTier !== 'QUOTE' && order.paymentStatus !== 'PAID') {
            throw new Error('Payment required before submission');
        }

        // Create admin ticket with order details
        const ticketSubject = `Nouvelle commande boutique – ${order.contactName || order.user.firstName}`;

        const ticketContent = this.formatOrderForTicket(order);

        const ticket = await prisma.ticket.create({
            data: {
                subject: ticketSubject,
                status: 'OPEN',
                priority: 'HIGH',
                category: 'SHOP_ORDER',
                userId: order.userId,
                messages: {
                    create: {
                        content: ticketContent,
                        senderType: 'SYSTEM',
                        isInternal: false
                    }
                }
            }
        });

        // Update order status and link ticket
        const updatedOrder = await prisma.shopOrder.update({
            where: { id: orderId },
            data: {
                status: 'SUBMITTED',
                submittedAt: new Date(),
                ticketId: ticket.id
            },
            include: {
                files: true,
                ticket: true
            }
        });

        return updatedOrder;
    },

    /**
     * Format order data for ticket content
     */
    formatOrderForTicket(order: any): string {
        const sections = [];

        // Header
        sections.push('## 📦 Détails de la commande\n');

        // Pricing
        const tierLabels: Record<string, string> = {
            'TIER_1': '1-3 produits (299€)',
            'TIER_2': '4-10 produits (599€)',
            'QUOTE': '10+ produits (Sur devis)'
        };
        sections.push(`**💰 Formule:** ${tierLabels[order.pricingTier] || 'Non défini'}`);
        sections.push(`**🛒 Nombre de produits:** ${order.productCount}\n`);

        // Step 1: Brand
        sections.push('### 🏷️ Marque');
        sections.push(`**Nom de marque:** ${order.brandName || 'Non défini'}\n`);

        // Step 2: Logo
        sections.push('### 🎨 Logo');
        if (order.hasOwnLogo && order.logoUrl) {
            sections.push(`**Logo fourni:** [Voir le logo](${order.logoUrl})`);
        } else if (order.logoStyle) {
            sections.push(`**Style de logo souhaité:** ${order.logoStyle}`);
        } else {
            sections.push('**Logo:** Non défini');
        }
        sections.push('');

        // Step 3: Product
        sections.push('### 📦 Produit');
        if (order.productSource === 'OWN' && order.ownProductInfo) {
            const productInfo = typeof order.ownProductInfo === 'string'
                ? JSON.parse(order.ownProductInfo)
                : order.ownProductInfo;
            sections.push(`**Source:** Produit propre`);
            sections.push(`**Détails:** ${JSON.stringify(productInfo, null, 2)}`);
        } else if (order.productSource === 'TRENDING') {
            sections.push(`**Source:** Produit tendance sélectionné`);
            sections.push(`**ID Produit:** ${order.selectedProductId}`);
        }
        sections.push('');

        // Step 4: Languages
        sections.push('### 🌐 Langues');
        const languages = order.siteLanguages || [];
        sections.push(`**Langues:** ${Array.isArray(languages) ? languages.join(', ') : languages}`);
        sections.push(`**Multilingue:** ${order.isMultilingual ? 'Oui' : 'Non'}\n`);

        // Step 5: Style
        sections.push('### 🎨 Style');
        sections.push(`**Style:** ${order.selectedStyle || 'Non défini'}`);
        if (order.colorPalette) {
            const colors = typeof order.colorPalette === 'string'
                ? JSON.parse(order.colorPalette)
                : order.colorPalette;
            sections.push(`**Couleurs:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}`);
        }
        sections.push('');

        // Step 6: Contact Info
        sections.push('### 📞 Informations de contact');
        sections.push(`**Nom:** ${order.contactName || 'Non défini'}`);
        sections.push(`**Email:** ${order.contactEmail || 'Non défini'}`);
        sections.push(`**WhatsApp:** ${order.contactWhatsApp || 'Non défini'}`);
        sections.push(`**Fuseau horaire:** ${order.timezone || 'Non défini'}\n`);

        // Step 7: Upsells
        sections.push('### ⭐ Upsells');
        const upsells = [];
        if (order.wantsAdsVisuals) upsells.push('Visuels Ads');
        if (order.wantsUGC) upsells.push('UGC');
        if (order.wantsCopywriting) upsells.push('Copywriting');
        if (order.wantsPremiumLogo) upsells.push('Logo Premium');
        sections.push(`**Options sélectionnées:** ${upsells.length > 0 ? upsells.join(', ') : 'Aucun'}\n`);

        // Shopify Info
        sections.push('### 🔗 Shopify');
        sections.push(`**URL Boutique:** ${order.shopifyStoreUrl || 'Non fourni'}`);
        sections.push(`**Token API:** ${order.shopifyApiToken ? '✅ Fourni' : '❌ Non fourni'}`);
        if (order.inspirationUrls) {
            const urls = Array.isArray(order.inspirationUrls) ? order.inspirationUrls : JSON.parse(order.inspirationUrls);
            sections.push(`**Sites d'inspiration:** \n${urls.map((u: string, i: number) => `  ${i + 1}. ${u}`).join('\n')}`);
        }
        sections.push('');

        // Step 8: Notes
        if (order.additionalNotes) {
            sections.push('### 📝 Notes additionnelles');
            sections.push(order.additionalNotes);
            sections.push('');
        }

        // Files
        if (order.files && order.files.length > 0) {
            sections.push('### 📎 Fichiers joints');
            order.files.forEach((file: any, index: number) => {
                sections.push(`${index + 1}. [${file.fileName}](${file.fileUrl}) (${file.fileType})`);
            });
            sections.push('');
        }

        // Payment Info
        sections.push('### 💳 Paiement');
        sections.push(`**Statut:** ${order.paymentStatus}`);
        if (order.hotmartTransactionCode) {
            sections.push(`**Transaction Hotmart:** ${order.hotmartTransactionCode}`);
        }
        if (order.paidAt) {
            sections.push(`**Payé le:** ${new Date(order.paidAt).toLocaleString('fr-FR')}`);
        }

        return sections.join('\n');
    },

    /**
     * Get user's orders
     */
    async getUserOrders(userId: string) {
        return prisma.shopOrder.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                files: true,
                ticket: {
                    select: {
                        id: true,
                        status: true
                    }
                }
            }
        });
    },

    /**
     * Get order by ID
     */
    async getOrderById(orderId: string, userId?: string) {
        const where: any = { id: orderId };
        if (userId) {
            where.userId = userId;
        }

        return prisma.shopOrder.findFirst({
            where,
            include: {
                files: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                },
                ticket: {
                    select: {
                        id: true,
                        status: true,
                        accessToken: true
                    }
                }
            }
        });
    },

    /**
     * Admin: Get all orders with filters
     */
    async adminGetAllOrders(filters: {
        status?: ShopOrderStatus;
        paymentStatus?: PaymentStatus;
        search?: string;
        page?: number;
        limit?: number;
    }) {
        const { status, paymentStatus, search, page = 1, limit = 20 } = filters;

        const where: any = {};

        // Exclude drafts by default for admin view
        if (status) {
            where.status = status;
        } else {
            where.status = { not: 'DRAFT' };
        }

        if (paymentStatus) {
            where.paymentStatus = paymentStatus;
        }

        if (search) {
            where.OR = [
                { contactName: { contains: search } },
                { contactEmail: { contains: search } },
                { brandName: { contains: search } },
                { adminNotes: { contains: search } }
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.shopOrder.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    },
                    files: true
                }
            }),
            prisma.shopOrder.count({ where })
        ]);

        return {
            orders,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    /**
     * Admin: Get stats for dashboard
     */
    async adminGetStats() {
        const [
            totalOrders,
            pendingPayment,
            submitted,
            inProgress,
            completed
        ] = await Promise.all([
            prisma.shopOrder.count({ where: { status: { not: 'DRAFT' } } }),
            prisma.shopOrder.count({ where: { status: 'PENDING_PAYMENT' } }),
            prisma.shopOrder.count({ where: { status: 'SUBMITTED' } }),
            prisma.shopOrder.count({ where: { status: 'IN_PROGRESS' } }),
            prisma.shopOrder.count({ where: { status: 'COMPLETED' } })
        ]);

        return {
            totalOrders,
            pendingPayment,
            submitted,
            inProgress,
            completed
        };
    },

    /**
     * Admin: Update order status
     */
    async adminUpdateStatus(orderId: string, status: ShopOrderStatus) {
        const updateData: any = { status };

        if (status === 'COMPLETED') {
            updateData.completedAt = new Date();
        }

        return prisma.shopOrder.update({
            where: { id: orderId },
            data: updateData,
            include: {
                files: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });
    },

    /**
     * Admin: Update notes (for assignment filtering)
     */
    async adminUpdateNotes(orderId: string, notes: string) {
        return prisma.shopOrder.update({
            where: { id: orderId },
            data: { adminNotes: notes }
        });
    },

    /**
     * Mark order as paid (called from Hotmart webhook)
     */
    async markAsPaid(orderId: string, transactionCode: string) {
        return prisma.shopOrder.update({
            where: { id: orderId },
            data: {
                paymentStatus: 'PAID',
                hotmartTransactionCode: transactionCode,
                paidAt: new Date()
            }
        });
    },

    /**
     * Find order by Hotmart transaction
     */
    async findByHotmartTransaction(transactionCode: string) {
        return prisma.shopOrder.findFirst({
            where: { hotmartTransactionCode: transactionCode }
        });
    }
};
