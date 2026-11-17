ALTER TABLE "projects" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");
