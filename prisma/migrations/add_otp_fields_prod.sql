-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_referredById_fkey`;

-- DropForeignKey
ALTER TABLE `transactions` DROP FOREIGN KEY `transactions_userId_fkey`;

-- DropForeignKey
ALTER TABLE `content_creators` DROP FOREIGN KEY `content_creators_nicheId_fkey`;

-- DropForeignKey
ALTER TABLE `content_creators` DROP FOREIGN KEY `content_creators_regionId_fkey`;

-- DropForeignKey
ALTER TABLE `notifications` DROP FOREIGN KEY `notifications_userId_fkey`;

-- DropForeignKey
ALTER TABLE `search_history` DROP FOREIGN KEY `search_history_userId_fkey`;

-- DropForeignKey
ALTER TABLE `visited_profiles` DROP FOREIGN KEY `visited_profiles_creatorId_fkey`;

-- DropForeignKey
ALTER TABLE `visited_profiles` DROP FOREIGN KEY `visited_profiles_userId_fkey`;

-- DropForeignKey
ALTER TABLE `course_purchases` DROP FOREIGN KEY `course_purchases_courseId_fkey`;

-- DropForeignKey
ALTER TABLE `course_purchases` DROP FOREIGN KEY `course_purchases_userId_fkey`;

-- DropForeignKey
ALTER TABLE `videos` DROP FOREIGN KEY `videos_sectionId_fkey`;

-- DropForeignKey
ALTER TABLE `course_sections` DROP FOREIGN KEY `course_sections_courseId_fkey`;

-- DropForeignKey
ALTER TABLE `video_progress` DROP FOREIGN KEY `video_progress_userId_fkey`;

-- DropForeignKey
ALTER TABLE `video_progress` DROP FOREIGN KEY `video_progress_videoId_fkey`;

-- DropForeignKey
ALTER TABLE `user_favorites` DROP FOREIGN KEY `user_favorites_productId_fkey`;

-- DropForeignKey
ALTER TABLE `user_favorites` DROP FOREIGN KEY `user_favorites_userId_fkey`;

-- DropTable
DROP TABLE `users`;

-- DropTable
DROP TABLE `transactions`;

-- DropTable
DROP TABLE `content_creators`;

-- DropTable
DROP TABLE `regions`;

-- DropTable
DROP TABLE `niches`;

-- DropTable
DROP TABLE `notifications`;

-- DropTable
DROP TABLE `search_history`;

-- DropTable
DROP TABLE `visited_profiles`;

-- DropTable
DROP TABLE `migrated_files`;

-- DropTable
DROP TABLE `video_courses`;

-- DropTable
DROP TABLE `course_purchases`;

-- DropTable
DROP TABLE `videos`;

-- DropTable
DROP TABLE `course_sections`;

-- DropTable
DROP TABLE `video_progress`;

-- DropTable
DROP TABLE `winning_products`;

-- DropTable
DROP TABLE `user_favorites`;

-- DropTable
DROP TABLE `settings`;

