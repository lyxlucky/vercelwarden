ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `devices` ADD `refresh_token_hash` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `revoked_at` integer;
--> statement-breakpoint
CREATE TABLE `two_factor_credentials` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`secret_ciphertext` text,
	`credential_id` text,
	`public_key` text,
	`transports` text,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `two_factor_user_status_idx` ON `two_factor_credentials` (`user_uuid`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_credential_id_idx` ON `two_factor_credentials` (`credential_id`);
--> statement-breakpoint
INSERT INTO `two_factor_credentials` (`uuid`, `user_uuid`, `provider`, `name`, `status`, `secret_ciphertext`, `created_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`uuid`, 'totp', 'Authenticator', 'active', 'legacy:' || `totp_secret`, unixepoch()
FROM `users` WHERE `totp_secret` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `account_passkeys` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`name` text NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`direct_unlock` integer DEFAULT false NOT NULL,
	`encrypted_user_key` text,
	`encrypted_private_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_passkey_credential_idx` ON `account_passkeys` (`credential_id`);
--> statement-breakpoint
CREATE INDEX `account_passkey_user_idx` ON `account_passkeys` (`user_uuid`);
--> statement-breakpoint
CREATE TABLE `recovery_code_hashes` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_code_user_active_idx` ON `recovery_code_hashes` (`user_uuid`,`consumed_at`);
--> statement-breakpoint
CREATE TABLE `admin_invites` (
	`uuid` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invite_code_hash_idx` ON `admin_invites` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `admin_invite_email_expiry_idx` ON `admin_invites` (`email`,`expires_at`);

-- Rollback (manual, after disabling auth writes): drop admin_invites,
-- recovery_code_hashes, account_passkeys and two_factor_credentials in that order.
-- SQLite cannot drop users.role in place; rebuild users without that column if rollback is required.
