-- AlterTable
ALTER TABLE `winning_products` ADD COLUMN `categoryName` VARCHAR(191) NULL,
    ADD COLUMN `firstLevelCategoryName` VARCHAR(191) NULL,
    ADD COLUMN `historicalData` JSON NULL;

-- CreateTable
CREATE TABLE `user_favorites` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_favorites_userId_productId_key`(`userId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_favorites` ADD CONSTRAINT `user_favorites_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_favorites` ADD CONSTRAINT `user_favorites_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `winning_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
