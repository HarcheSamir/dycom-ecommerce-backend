-- CreateTable
CREATE TABLE `user_seen_courses` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_seen_courses_courseId_fkey`(`courseId`),
    UNIQUE INDEX `user_seen_courses_userId_courseId_key`(`userId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_seen_courses` ADD CONSTRAINT `user_seen_courses_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_seen_courses` ADD CONSTRAINT `user_seen_courses_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `video_courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
