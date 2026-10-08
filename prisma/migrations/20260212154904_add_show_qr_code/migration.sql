-- AlterTable
ALTER TABLE "Display" ADD COLUMN     "showQrCode" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Slide" ADD COLUMN     "linkUrl" TEXT;
