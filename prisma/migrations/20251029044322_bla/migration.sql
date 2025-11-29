/*
  Warnings:

  - A unique constraint covering the columns `[stripePriceId]` on the table `video_courses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `video_courses` ADD COLUMN `price` DOUBLE NULL,
    ADD COLUMN `stripePriceId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `course_purchases` (
    `id` VARCHAR(191) NOT NULL,
    `purchasePrice` DOUBLE NOT NULL,
    `purchasedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `course_purchases_userId_courseId_key`(`userId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `video_courses_stripePriceId_key` ON `video_courses`(`stripePriceId`);

-- AddForeignKey
ALTER TABLE `course_purchases` ADD CONSTRAINT `course_purchases_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_purchases` ADD CONSTRAINT `course_purchases_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `video_courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
