ALTER TABLE "refresh_tokens" ADD COLUMN     "family_id" UUID;

UPDATE "refresh_tokens" SET "family_id" = "id";

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
