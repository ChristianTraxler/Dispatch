-- CreateEnum
CREATE TYPE "AddOnKind" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "AddOnScope" AS ENUM ('PER_SITE', 'PER_CLIENT');

-- CreateEnum
CREATE TYPE "AddOnPriceUnit" AS ENUM ('ONE_TIME', 'PER_MONTH', 'PER_YEAR');

-- CreateEnum
CREATE TYPE "ClientAddOnStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "add_on_id" TEXT;

-- CreateTable
CREATE TABLE "add_ons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "AddOnKind" NOT NULL,
    "scope" "AddOnScope" NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "price_unit" "AddOnPriceUnit" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_client_prices" (
    "id" TEXT NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "client_account_id" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_on_client_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_add_ons" (
    "id" TEXT NOT NULL,
    "client_account_id" TEXT NOT NULL,
    "add_on_id" TEXT NOT NULL,
    "site_id" TEXT,
    "status" "ClientAddOnStatus" NOT NULL DEFAULT 'ACTIVE',
    "price_cents" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "request_ticket_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "add_ons_is_active_sort_order_idx" ON "add_ons"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "add_on_client_prices_client_account_id_idx" ON "add_on_client_prices"("client_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "add_on_client_prices_add_on_id_client_account_id_key" ON "add_on_client_prices"("add_on_id", "client_account_id");

-- CreateIndex
CREATE INDEX "client_add_ons_client_account_id_status_idx" ON "client_add_ons"("client_account_id", "status");

-- CreateIndex
CREATE INDEX "client_add_ons_add_on_id_idx" ON "client_add_ons"("add_on_id");

-- CreateIndex
CREATE INDEX "client_add_ons_site_id_idx" ON "client_add_ons"("site_id");

-- CreateIndex
CREATE INDEX "tickets_add_on_id_idx" ON "tickets"("add_on_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_client_prices" ADD CONSTRAINT "add_on_client_prices_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_on_client_prices" ADD CONSTRAINT "add_on_client_prices_client_account_id_fkey" FOREIGN KEY ("client_account_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_add_ons" ADD CONSTRAINT "client_add_ons_client_account_id_fkey" FOREIGN KEY ("client_account_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_add_ons" ADD CONSTRAINT "client_add_ons_add_on_id_fkey" FOREIGN KEY ("add_on_id") REFERENCES "add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_add_ons" ADD CONSTRAINT "client_add_ons_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_add_ons" ADD CONSTRAINT "client_add_ons_request_ticket_id_fkey" FOREIGN KEY ("request_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
