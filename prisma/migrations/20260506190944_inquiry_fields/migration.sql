-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "admin_nudged_at" TIMESTAMP(3),
ADD COLUMN     "inquiry_ended_at" TIMESTAMP(3),
ADD COLUMN     "is_inquiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_message_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_is_inquiry_inquiry_ended_at_idx" ON "tickets"("is_inquiry", "inquiry_ended_at");

-- CreateIndex
CREATE INDEX "tickets_client_account_id_is_inquiry_inquiry_ended_at_idx" ON "tickets"("client_account_id", "is_inquiry", "inquiry_ended_at");
