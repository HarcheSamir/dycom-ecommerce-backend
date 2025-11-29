/*
  Warnings:

  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `currentPeriodEnd` DATETIME(3) NULL,
    ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL,
    ADD COLUMN `subscriptionStatus` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE') NOT NULL DEFAULT 'INCOMPLETE';

-- CreateIndex
CREATE UNIQUE INDEX `users_stripeSubscriptionId_key` ON `users`(`stripeSubscriptionId`);
