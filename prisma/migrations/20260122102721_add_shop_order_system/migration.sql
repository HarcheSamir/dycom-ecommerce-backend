-- CreateTable
CREATE TABLE `shop_orders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_PAYMENT', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `brandName` VARCHAR(191) NULL,
    `hasOwnLogo` BOOLEAN NOT NULL DEFAULT false,
    `logoUrl` TEXT NULL,
    `logoStyle` VARCHAR(191) NULL,
    `productSource` ENUM('OWN', 'TRENDING') NULL,
    `ownProductInfo` JSON NULL,
    `selectedProductId` VARCHAR(191) NULL,
    `productCount` INTEGER NOT NULL DEFAULT 1,
    `siteLanguages` JSON NULL,
    `isMultilingual` BOOLEAN NOT NULL DEFAULT false,
    `selectedStyle` VARCHAR(191) NULL,
    `colorPalette` JSON NULL,
    `contactName` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `contactWhatsApp` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NULL,
    `wantsAdsVisuals` BOOLEAN NOT NULL DEFAULT false,
    `wantsUGC` BOOLEAN NOT NULL DEFAULT false,
    `wantsCopywriting` BOOLEAN NOT NULL DEFAULT false,
    `wantsPremiumLogo` BOOLEAN NOT NULL DEFAULT false,
    `additionalNotes` TEXT NULL,
    `shopifyStoreUrl` VARCHAR(191) NULL,
    `shopifyApiToken` TEXT NULL,
    `inspirationUrls` JSON NULL,
    `pricingTier` ENUM('TIER_1', 'TIER_2', 'QUOTE') NULL,
    `totalPrice` DOUBLE NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `hotmartTransactionCode` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `adminNotes` TEXT NULL,
    `ticketId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `shop_orders_hotmartTransactionCode_key`(`hotmartTransactionCode`),
    UNIQUE INDEX `shop_orders_ticketId_key`(`ticketId`),
    INDEX `shop_orders_userId_idx`(`userId`),
    INDEX `shop_orders_status_idx`(`status`),
    INDEX `shop_orders_paymentStatus_idx`(`paymentStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_order_files` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` TEXT NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `cloudinaryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `shop_order_files_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shop_orders` ADD CONSTRAINT `shop_orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_orders` ADD CONSTRAINT `shop_orders_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `tickets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_order_files` ADD CONSTRAINT `shop_order_files_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `shop_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
