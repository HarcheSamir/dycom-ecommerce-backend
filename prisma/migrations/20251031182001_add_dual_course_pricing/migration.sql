/*
  Warnings:

  - You are about to drop the column `price` on the `video_courses` table. All the data in the column will be lost.
  - You are about to drop the column `stripePriceId` on the `video_courses` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[stripePriceIdEur]` on the table `video_courses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePriceIdUsd]` on the table `video_courses` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `video_courses_stripePriceId_key` ON `video_courses`;

-- AlterTable
ALTER TABLE `video_courses` DROP COLUMN `price`,
    DROP COLUMN `stripePriceId`,
    ADD COLUMN `priceEur` DOUBLE NULL,
    ADD COLUMN `priceUsd` DOUBLE NULL,
    ADD COLUMN `stripePriceIdEur` VARCHAR(191) NULL,
    ADD COLUMN `stripePriceIdUsd` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `video_courses_stripePriceIdEur_key` ON `video_courses`(`stripePriceIdEur`);

-- CreateIndex
CREATE UNIQUE INDEX `video_courses_stripePriceIdUsd_key` ON `video_courses`(`stripePriceIdUsd`);
