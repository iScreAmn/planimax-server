-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'done');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('scheduled', 'sending', 'sent', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "date" DATE,
    "time" VARCHAR(5),
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reminder_at" TIMESTAMP(3),
    "reminder_timezone" VARCHAR(64),
    "reminder_status" "ReminderStatus",
    "reminder_next_attempt_at" TIMESTAMP(3),
    "reminder_claimed_at" TIMESTAMP(3),
    "reminder_attempts" INTEGER NOT NULL DEFAULT 0,
    "reminder_sent_at" TIMESTAMP(3),
    "reminder_last_error" VARCHAR(500),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_user_id_date_idx" ON "tasks"("user_id", "date");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_reminder_status_reminder_next_attempt_at_idx" ON "tasks"("reminder_status", "reminder_next_attempt_at");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
