/*
  Warnings:

  - You are about to drop the `commissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payout_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `commissions` DROP FOREIGN KEY `commissions_affiliateId_fkey`;

-- DropForeignKey
ALTER TABLE `commissions` DROP FOREIGN KEY `commissions_payoutRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `commissions` DROP FOREIGN KEY `commissions_sourceTransactionId_fkey`;

-- DropForeignKey
ALTER TABLE `payout_requests` DROP FOREIGN KEY `payout_requests_affiliateId_fkey`;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `availableCourseDiscounts` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `commissions`;

-- DropTable
DROP TABLE `payout_requests`;
