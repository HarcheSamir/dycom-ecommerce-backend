/*
  Warnings:

  - A unique constraint covering the columns `[stripePriceIdAed]` on the table `video_courses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `video_courses` ADD COLUMN `language` ENUM('FR', 'EN', 'AR') NOT NULL DEFAULT 'EN',
    ADD COLUMN `priceAed` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `stripePriceIdAed` VARCHAR(191) NULL,
    MODIFY `priceEur` DOUBLE NULL DEFAULT 0,
    MODIFY `priceUsd` DOUBLE NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `video_courses_stripePriceIdAed_key` ON `video_courses`(`stripePriceIdAed`);
