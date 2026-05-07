-- AlterTable
ALTER TABLE "admin_settings" ADD COLUMN     "emergency_fee_cents" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "emergency_fee_amount_cents" INTEGER,
ADD COLUMN     "is_emergency" BOOLEAN NOT NULL DEFAULT false;
