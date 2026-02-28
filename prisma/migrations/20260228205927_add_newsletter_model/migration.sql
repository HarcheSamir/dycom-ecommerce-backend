-- CreateTable
CREATE TABLE `newsletters` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `htmlContent` LONGTEXT NOT NULL,
    `audience` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    `recipientCount` INTEGER NOT NULL DEFAULT 0,
    `sentBy` VARCHAR(191) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `newsletters_sentBy_idx`(`sentBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `newsletters` ADD CONSTRAINT `newsletters_sentBy_fkey` FOREIGN KEY (`sentBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
