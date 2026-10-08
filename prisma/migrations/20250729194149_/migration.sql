/*
  Warnings:

  - You are about to drop the column `slideInterval` on the `Display` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Display" DROP COLUMN "slideInterval";

-- AlterTable
ALTER TABLE "Slide" ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 10;
