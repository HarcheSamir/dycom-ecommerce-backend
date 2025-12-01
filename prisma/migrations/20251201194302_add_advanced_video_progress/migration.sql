-- AlterTable
ALTER TABLE `video_progress` ADD COLUMN `lastPosition` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `percentage` INTEGER NOT NULL DEFAULT 0;
