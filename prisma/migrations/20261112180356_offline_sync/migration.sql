ALTER TABLE "projects" ADD COLUMN     "notes_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "refresh_tokens" ADD COLUMN     "rotated_at" TIMESTAMP(3);
