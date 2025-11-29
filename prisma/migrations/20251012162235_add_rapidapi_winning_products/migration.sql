-- CreateTable
CREATE TABLE `winning_products` (
    `id` VARCHAR(191) NOT NULL,
    `productId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `productUrl` TEXT NULL,
    `imageUrl` TEXT NULL,
    `price` DOUBLE NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'USD',
    `salesVolume` INTEGER NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'RapidAPI/AliExpress',
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `winning_products_productId_key`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
