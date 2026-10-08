-- CreateTable
CREATE TABLE "DisplayAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayId" INTEGER NOT NULL,

    CONSTRAINT "DisplayAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplayAsset_s3Path_key" ON "DisplayAsset"("s3Path");

-- CreateIndex
CREATE INDEX "DisplayAsset_displayId_idx" ON "DisplayAsset"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayAsset_displayId_filename_key" ON "DisplayAsset"("displayId", "filename");

-- AddForeignKey
ALTER TABLE "DisplayAsset" ADD CONSTRAINT "DisplayAsset_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;
