/*
  Warnings:

  - A unique constraint covering the columns `[hotmartTransactionCode]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `hotmartTransactionCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `hotmartTransactionCode` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_hotmartTransactionCode_key` ON `users`(`hotmartTransactionCode`);
