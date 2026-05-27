-- AlterTable
ALTER TABLE "add_on_client_prices" ADD COLUMN     "price_max_cents" INTEGER;

-- AlterTable
ALTER TABLE "add_ons" ADD COLUMN     "price_max_cents" INTEGER;
