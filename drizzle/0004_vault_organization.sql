ALTER TABLE `ciphers` ADD `archived_at` integer;
--> statement-breakpoint
UPDATE `ciphers`
SET `updated_at` = COALESCE(`updated_at`, `created_at`, unixepoch())
WHERE `updated_at` IS NULL;
--> statement-breakpoint
DELETE FROM `folder_ciphers`
WHERE rowid NOT IN (
	SELECT MIN(rowid)
	FROM `folder_ciphers`
	GROUP BY `cipher_uuid`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folder_ciphers_cipher_uuid_idx` ON `folder_ciphers` (`cipher_uuid`);
--> statement-breakpoint
CREATE INDEX `folder_ciphers_folder_uuid_idx` ON `folder_ciphers` (`folder_uuid`);
--> statement-breakpoint
CREATE INDEX `ciphers_user_state_updated_idx` ON `ciphers` (`user_uuid`,`deleted_at`,`archived_at`,`updated_at`);

-- Rollback (manual): drop ciphers_user_state_updated_idx,
-- folder_ciphers_folder_uuid_idx and folder_ciphers_cipher_uuid_idx. SQLite
-- requires rebuilding ciphers to remove archived_at.
