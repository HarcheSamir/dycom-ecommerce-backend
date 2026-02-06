/*
  Warnings:

  - A unique constraint covering the columns `[emailChangeToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `emailChangeExpires` DATETIME(3) NULL,
    ADD COLUMN `emailChangeToken` VARCHAR(191) NULL,
    ADD COLUMN `pendingEmail` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_emailChangeToken_key` ON `users`(`emailChangeToken`);
