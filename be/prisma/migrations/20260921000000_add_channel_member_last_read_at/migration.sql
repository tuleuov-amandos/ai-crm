-- AlterTable
ALTER TABLE "ChannelMember" ADD COLUMN     "lastReadAt" TIMESTAMP(3);

-- Backfill: every existing membership is marked read as of right now, so
-- rolling this out doesn't make every channel's entire history show up as
-- unread for every existing member. New memberships created after this
-- migration keep lastReadAt NULL on purpose — the app treats that as
-- "unread since joinedAt" (see ChatRepository.findAllChannels).
UPDATE "ChannelMember" SET "lastReadAt" = CURRENT_TIMESTAMP WHERE "lastReadAt" IS NULL;
