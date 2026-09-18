-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bik" TEXT,
ADD COLUMN     "bin" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "legalAddress" TEXT;

-- CreateIndex
CREATE INDEX "Contact_tenantId_city_idx" ON "Contact"("tenantId", "city");
