-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "Task_tenantId_assigneeId_idx" ON "Task"("tenantId", "assigneeId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
