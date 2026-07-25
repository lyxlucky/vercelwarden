ALTER TABLE `attachments` ADD `status` text DEFAULT 'complete' NOT NULL;
--> statement-breakpoint
ALTER TABLE `attachments` ADD `checksum` text;
--> statement-breakpoint
ALTER TABLE `attachments` ADD `upload_token_hash` text;
--> statement-breakpoint
ALTER TABLE `attachments` ADD `upload_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `attachments` ADD `completed_at` integer;
--> statement-breakpoint
UPDATE `attachments` SET `completed_at` = `created_at` WHERE `completed_at` IS NULL;
