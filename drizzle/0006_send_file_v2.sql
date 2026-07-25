CREATE TABLE `send_files` (
	`uuid` text PRIMARY KEY NOT NULL,
	`send_uuid` text NOT NULL,
	`file_name` text NOT NULL,
	`key` text,
	`file_size` integer NOT NULL,
	`blob_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`checksum` text,
	`upload_token_hash` text,
	`upload_expires_at` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`send_uuid`) REFERENCES `sends`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `send_files_send_uuid_idx` ON `send_files` (`send_uuid`);
--> statement-breakpoint
CREATE INDEX `send_files_pending_expiry_idx` ON `send_files` (`status`,`upload_expires_at`);
--> statement-breakpoint
CREATE INDEX `sends_user_updated_idx` ON `sends` (`user_uuid`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `sends_public_access_idx` ON `sends` (`uuid`,`disabled`,`deletion_date`,`expiration_date`);
--> statement-breakpoint
INSERT INTO `send_files` (`uuid`,`send_uuid`,`file_name`,`key`,`file_size`,`blob_url`,`status`,`checksum`,`created_at`,`completed_at`)
SELECT
	json_extract(`data`, '$.id'),
	`uuid`,
	COALESCE(json_extract(`data`, '$.fileName'), json_extract(`data`, '$.FileName'), ''),
	NULL,
	CAST(COALESCE(json_extract(`data`, '$.size'), 0) AS integer),
	COALESCE(json_extract(`data`, '$.url'), ''),
	'complete',
	NULL,
	`created_at`,
	`created_at`
FROM `sends`
WHERE `type` = 1
	AND json_valid(`data`)
	AND json_extract(`data`, '$.id') IS NOT NULL
	AND NOT EXISTS (SELECT 1 FROM `send_files` WHERE `send_files`.`send_uuid` = `sends`.`uuid`);
