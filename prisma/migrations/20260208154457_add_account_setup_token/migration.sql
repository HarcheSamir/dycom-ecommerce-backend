/*
  Warnings:

  - A unique constraint covering the columns `[accountSetupToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `accountSetupToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_accountSetupToken_key` ON `users`(`accountSetupToken`);
