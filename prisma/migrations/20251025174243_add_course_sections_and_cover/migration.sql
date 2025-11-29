/*
  Warnings:

  - Added the required column `sectionId` to the `videos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `video_courses` ADD COLUMN `coverImageUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `videos` ADD COLUMN `sectionId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `course_sections` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `courseId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `course_sections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_sections` ADD CONSTRAINT `course_sections_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `video_courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
