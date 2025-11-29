-- AlterTable
ALTER TABLE `payout_requests` ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'usd';
