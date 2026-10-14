-- AlterTable
ALTER TABLE "PORequirement" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PORequirement_isActive_idx" ON "PORequirement"("isActive");

-- CreateIndex
CREATE INDEX "PORequirement_isArchived_idx" ON "PORequirement"("isArchived");
