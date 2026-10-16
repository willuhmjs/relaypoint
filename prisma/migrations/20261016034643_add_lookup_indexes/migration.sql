-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "DisplayClient_lastSeen_idx" ON "DisplayClient"("lastSeen");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
