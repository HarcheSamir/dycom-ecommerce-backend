/*
  Warnings:

  - You are about to drop the column `thumbnailUrl` on the `videos` table. All the data in the column will be lost.
  - You are about to drop the column `videoUrl` on the `videos` table. All the data in the column will be lost.
  - Added the required column `vimeoId` to the `videos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `videos` DROP COLUMN `thumbnailUrl`,
    DROP COLUMN `videoUrl`,
    ADD COLUMN `vimeoId` TEXT NOT NULL;
