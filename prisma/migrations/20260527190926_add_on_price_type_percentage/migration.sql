-- CreateEnum
CREATE TYPE "AddOnPriceType" AS ENUM ('FIXED', 'RANGE', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "add_on_client_prices" ADD COLUMN     "price_percent_bp" INTEGER,
ADD COLUMN     "price_type" "AddOnPriceType" NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "add_ons" ADD COLUMN     "price_percent_bp" INTEGER,
ADD COLUMN     "price_type" "AddOnPriceType" NOT NULL DEFAULT 'FIXED';
