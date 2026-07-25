CREATE TABLE `attachments` (
	`uuid` text PRIMARY KEY NOT NULL,
	`cipher_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`blob_url` text NOT NULL,
	FOREIGN KEY (`cipher_uuid`) REFERENCES `ciphers`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ciphers` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text,
	`organization_uuid` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`type` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`fields` text,
	`data` text NOT NULL,
	`key` text,
	`password_history` text,
	`favorite` integer DEFAULT false NOT NULL,
	`edit` integer DEFAULT true NOT NULL,
	`reprompt` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`type` integer NOT NULL,
	`identifier` text NOT NULL,
	`refresh_token` text NOT NULL,
	`push_token` text,
	`access_token_expiration` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folder_ciphers` (
	`folder_uuid` text NOT NULL,
	`cipher_uuid` text NOT NULL,
	FOREIGN KEY (`folder_uuid`) REFERENCES `folders`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cipher_uuid`) REFERENCES `ciphers`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invitation_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`created_by` text DEFAULT 'admin' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`uuid` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`password_hash` blob NOT NULL,
	`salt` blob NOT NULL,
	`password_iterations` integer DEFAULT 100000 NOT NULL,
	`password_hint` text,
	`akey` text NOT NULL,
	`private_key` text,
	`public_key` text,
	`client_kdf_type` integer DEFAULT 1 NOT NULL,
	`client_kdf_iter` integer DEFAULT 600000 NOT NULL,
	`client_kdf_memory` integer,
	`client_kdf_parallelism` integer,
	`security_stamp` text NOT NULL,
	`totp_secret` text,
	`totp_recover` text,
	`equivalent_domains` text DEFAULT '[]' NOT NULL,
	`excluded_globals` text DEFAULT '[]' NOT NULL,
	`avatar_color` text,
	`api_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`verified_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);