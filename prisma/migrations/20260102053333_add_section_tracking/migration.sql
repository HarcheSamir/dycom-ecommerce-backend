-- AlterTable
ALTER TABLE `course_sections` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `user_seen_sections` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_seen_sections_sectionId_fkey`(`sectionId`),
    UNIQUE INDEX `user_seen_sections_userId_sectionId_key`(`userId`, `sectionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_seen_sections` ADD CONSTRAINT `user_seen_sections_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_seen_sections` ADD CONSTRAINT `user_seen_sections_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `course_sections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
