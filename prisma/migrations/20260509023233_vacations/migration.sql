-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacations_start_date_end_date_idx" ON "vacations"("start_date", "end_date");
