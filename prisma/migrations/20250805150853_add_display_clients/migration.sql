-- CreateTable
CREATE TABLE "DisplayClient" (
    "id" TEXT NOT NULL,
    "friendlyName" TEXT,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "lastKnownIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayId" INTEGER NOT NULL,

    CONSTRAINT "DisplayClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisplayClient_displayId_idx" ON "DisplayClient"("displayId");

-- AddForeignKey
ALTER TABLE "DisplayClient" ADD CONSTRAINT "DisplayClient_displayId_fkey" FOREIGN KEY ("displayId") REFERENCES "Display"("id") ON DELETE CASCADE ON UPDATE CASCADE;
