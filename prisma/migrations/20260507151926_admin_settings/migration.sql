-- CreateTable
CREATE TABLE "admin_settings" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "hours" JSONB NOT NULL,
    "ooo_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ooo_until" TIMESTAMP(3),
    "ooo_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- Seed singleton settings row with sensible defaults
INSERT INTO "admin_settings" ("id", "timezone", "hours", "ooo_enabled", "updated_at")
VALUES (
  'global',
  'America/New_York',
  '{"0":{"enabled":false},"1":{"enabled":true,"open":"09:00","close":"17:00"},"2":{"enabled":true,"open":"09:00","close":"17:00"},"3":{"enabled":true,"open":"09:00","close":"17:00"},"4":{"enabled":true,"open":"09:00","close":"17:00"},"5":{"enabled":true,"open":"09:00","close":"17:00"},"6":{"enabled":false}}'::jsonb,
  false,
  NOW()
)
ON CONFLICT ("id") DO NOTHING;
