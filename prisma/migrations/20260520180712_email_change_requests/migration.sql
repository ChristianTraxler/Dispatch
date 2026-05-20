-- CreateTable
CREATE TABLE "email_change_requests" (
    "id" TEXT NOT NULL,
    "client_account_id" TEXT NOT NULL,
    "new_email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_change_requests_token_hash_key" ON "email_change_requests"("token_hash");

-- CreateIndex
CREATE INDEX "email_change_requests_client_account_id_idx" ON "email_change_requests"("client_account_id");

-- CreateIndex
CREATE INDEX "email_change_requests_new_email_idx" ON "email_change_requests"("new_email");

-- AddForeignKey
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_client_account_id_fkey" FOREIGN KEY ("client_account_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
