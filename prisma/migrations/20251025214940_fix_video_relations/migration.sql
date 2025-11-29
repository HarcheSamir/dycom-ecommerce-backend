-- DropForeignKey
ALTER TABLE `videos` DROP FOREIGN KEY `videos_courseId_fkey`;

-- DropIndex
DROP INDEX `videos_courseId_fkey` ON `videos`;
