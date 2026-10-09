-- ============================================================================
-- Company AI key storage (expand only).
-- Adds the AiProvider enum and the TenantAiCredential table, one row per
-- tenant. Nothing existing is changed; no backfill. The key itself is stored
-- only encrypted (encryptedKey), see src/common/crypto/ai-key-cipher.ts.
-- ============================================================================

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'GROQ', 'ANTHROPIC');

-- CreateTable
CREATE TABLE "TenantAiCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantAiCredential_tenantId_key" ON "TenantAiCredential"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantAiCredential" ADD CONSTRAINT "TenantAiCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAiCredential" ADD CONSTRAINT "TenantAiCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
