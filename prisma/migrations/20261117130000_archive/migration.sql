CREATE TYPE "ArchiveReason" AS ENUM ('completed', 'overdue');

ALTER TABLE "tasks" ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "archive_reason" "ArchiveReason";

CREATE INDEX "tasks_user_id_archived_at_idx" ON "tasks"("user_id", "archived_at");

ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
ADD COLUMN "trash_retention_days" INTEGER DEFAULT 30,
ADD COLUMN "archive_completed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archive_overdue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archive_purge_days" INTEGER;
