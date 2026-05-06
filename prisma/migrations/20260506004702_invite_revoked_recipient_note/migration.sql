-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "note" TEXT,
ADD COLUMN     "recipient_name" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3);
