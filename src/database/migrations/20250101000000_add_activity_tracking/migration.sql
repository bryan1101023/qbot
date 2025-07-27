-- Add activity tracking fields to User table
ALTER TABLE "User" ADD COLUMN "weeklyActivityMinutes" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "monthlyActivityMinutes" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastActivityReset" DATETIME; 