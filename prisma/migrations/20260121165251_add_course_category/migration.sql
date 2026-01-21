-- AlterTable
ALTER TABLE `video_courses` ADD COLUMN `category` ENUM('MAIN', 'ARCHIVE') NOT NULL DEFAULT 'MAIN';
