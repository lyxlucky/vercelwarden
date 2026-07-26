DROP INDEX `sends_public_access_idx`;--> statement-breakpoint
CREATE INDEX `sends_deletion_date_idx` ON `sends` (`deletion_date`);--> statement-breakpoint
ALTER TABLE `send_files` ADD `plaintext_size` integer;