-- CreateEnum
CREATE TYPE "SlideType" AS ENUM ('IMAGE', 'VIDEO', 'HTML');

-- AlterTable
ALTER TABLE "Display" ADD COLUMN     "slideInterval" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "transitionType" TEXT NOT NULL DEFAULT 'fade';

-- CreateTable
CREATE TABLE "Slide" (
    "id" SERIAL NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "SlideType" NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "displayId" INTEGER NOT NULL,

    CONSTRAINT "Slide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Slide_displayId_order_key" ON "Slide"("displayId", "order");

-- AddForeignKey
ALTER TABLE "Slide" ADD CONSTRAINT "Slide_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;
