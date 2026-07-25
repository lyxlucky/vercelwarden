CREATE TABLE `sends` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`organization_uuid` text,
	`name` text NOT NULL,
	`notes` text,
	`type` integer NOT NULL,
	`data` text NOT NULL,
	`key` text NOT NULL,
	`password` text,
	`max_access_count` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expiration_date` integer,
	`deletion_date` integer NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`hide_email` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `key` text;