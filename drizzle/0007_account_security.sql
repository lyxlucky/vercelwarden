ALTER TABLE `devices` ADD `system_name` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `note` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `trusted_at` integer;
--> statement-breakpoint
ALTER TABLE `devices` ADD `trusted_until` integer;
--> statement-breakpoint
ALTER TABLE `devices` ADD `last_seen_at` integer;
--> statement-breakpoint
CREATE TABLE `auth_requests` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`requesting_device_uuid` text,
	`requesting_device_identifier` text NOT NULL,
	`requesting_device_type` integer NOT NULL,
	`public_key` text NOT NULL,
	`encrypted_key` text,
	`ip_address` text,
	`country_code` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer,
	`responding_device_uuid` text,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responding_device_uuid`) REFERENCES `devices`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auth_requests_user_pending_idx` ON `auth_requests` (`user_uuid`,`status`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `auth_requests_requesting_device_idx` ON `auth_requests` (`user_uuid`,`requesting_device_identifier`);
--> statement-breakpoint
CREATE TABLE `domain_settings` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`equivalent_domains` text DEFAULT '[]' NOT NULL,
	`custom_equivalent_domains` text DEFAULT '[]' NOT NULL,
	`excluded_global_domain_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `domain_settings` (`user_uuid`,`equivalent_domains`,`custom_equivalent_domains`,`excluded_global_domain_ids`,`updated_at`)
SELECT `uuid`, `equivalent_domains`, '[]', `excluded_globals`, `updated_at`
FROM `users`
WHERE NOT EXISTS (SELECT 1 FROM `domain_settings` WHERE `domain_settings`.`user_uuid` = `users`.`uuid`);
--> statement-breakpoint
CREATE TABLE `reauth_proof_nonces` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`device_uuid` text NOT NULL,
	`purpose` text NOT NULL,
	`security_stamp` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_uuid`) REFERENCES `devices`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reauth_nonce_user_expiry_idx` ON `reauth_proof_nonces` (`user_uuid`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `reauth_nonce_active_idx` ON `reauth_proof_nonces` (`uuid`,`consumed_at`,`expires_at`);
--> statement-breakpoint
UPDATE `devices` SET `last_seen_at` = COALESCE(`updated_at`, `created_at`) WHERE `last_seen_at` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_user_identifier_idx` ON `devices` (`user_uuid`,`identifier`);
--> statement-breakpoint
CREATE INDEX `devices_user_activity_idx` ON `devices` (`user_uuid`,`revoked_at`,`last_seen_at`);
