/*
  Warnings:

  - A unique constraint covering the columns `[time,date,role]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Session_time_date_role_key" ON "Session"("time", "date", "role");
