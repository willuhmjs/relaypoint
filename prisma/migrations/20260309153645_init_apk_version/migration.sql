-- CreateTable
CREATE TABLE "ApkVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Path" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApkVersion_version_key" ON "ApkVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "ApkVersion_s3Path_key" ON "ApkVersion"("s3Path");
