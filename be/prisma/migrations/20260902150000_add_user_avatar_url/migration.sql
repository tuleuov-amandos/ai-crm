-- AlterTable
-- Optional profile picture. Holds the Cloudinary secure URL of the user's
-- avatar (see CloudinaryService); NULL means "no avatar, render initials".
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
