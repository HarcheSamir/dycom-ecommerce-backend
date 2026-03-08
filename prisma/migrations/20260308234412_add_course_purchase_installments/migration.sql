-- AlterTable
ALTER TABLE `course_purchases` ADD COLUMN `currentPeriodEnd` DATETIME(3) NULL,
    ADD COLUMN `installmentsPaid` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `installmentsRequired` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `status` ENUM('ACTIVE', 'PAST_DUE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE';
