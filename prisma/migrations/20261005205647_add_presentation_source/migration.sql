-- CreateTable
CREATE TABLE "PresentationSource" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayId" INTEGER NOT NULL,

    CONSTRAINT "PresentationSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresentationSource_s3Path_key" ON "PresentationSource"("s3Path");

-- CreateIndex
CREATE INDEX "PresentationSource_displayId_idx" ON "PresentationSource"("displayId");

-- AddForeignKey
ALTER TABLE "PresentationSource" ADD CONSTRAINT "PresentationSource_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;
