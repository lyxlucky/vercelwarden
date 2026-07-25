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
CREATE UNIQUE INDEX `account_passkey_credential_idx` ON `account_passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX `account_passkey_user_idx` ON `account_passkeys` (`user_uuid`);--> statement-breakpoint
CREATE TABLE `admin_invites` (
	`uuid` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`used_at` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invite_code_hash_idx` ON `admin_invites` (`code_hash`);--> statement-breakpoint
CREATE INDEX `admin_invite_email_expiry_idx` ON `admin_invites` (`email`,`expires_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`uuid` text PRIMARY KEY NOT NULL,
	`cipher_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`key` text,
	`blob_url` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`checksum` text,
	`upload_token_hash` text,
	`upload_expires_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`cipher_uuid`) REFERENCES `ciphers`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`uuid` text PRIMARY KEY NOT NULL,
	`actor_user_uuid` text,
	`actor_email_snapshot` text,
	`action` text NOT NULL,
	`category` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`target_type` text,
	`target_id` text,
	`outcome` text NOT NULL,
	`request_id` text,
	`ip_prefix` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_category_created_idx` ON `audit_events` (`category`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_user_uuid`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_retention_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`retention_days` integer,
	`max_entries` integer,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);
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
CREATE INDEX `auth_requests_user_pending_idx` ON `auth_requests` (`user_uuid`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `auth_requests_requesting_device_idx` ON `auth_requests` (`user_uuid`,`requesting_device_identifier`);--> statement-breakpoint
CREATE TABLE `backup_artifacts` (
	`uuid` text PRIMARY KEY NOT NULL,
	`run_uuid` text NOT NULL,
	`format_version` integer NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`encrypted_data_key` text NOT NULL,
	`manifest_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`run_uuid`) REFERENCES `backup_runs`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_artifacts_object_key_idx` ON `backup_artifacts` (`object_key`);--> statement-breakpoint
CREATE INDEX `backup_artifacts_run_idx` ON `backup_artifacts` (`run_uuid`);--> statement-breakpoint
CREATE INDEX `backup_artifacts_expiry_idx` ON `backup_artifacts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `backup_destinations` (
	`uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`schedule` text,
	`retention_count` integer DEFAULT 10 NOT NULL,
	`include_attachments` integer DEFAULT true NOT NULL,
	`encrypted_config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_destinations_enabled_idx` ON `backup_destinations` (`enabled`);--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`uuid` text PRIMARY KEY NOT NULL,
	`destination_uuid` text,
	`trigger` text NOT NULL,
	`mode` text DEFAULT 'full' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`requested_by` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`destination_uuid`) REFERENCES `backup_destinations`(`uuid`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backup_runs_status_created_idx` ON `backup_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `backup_runs_destination_created_idx` ON `backup_runs` (`destination_uuid`,`created_at`);--> statement-breakpoint
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
	`archived_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ciphers_user_state_updated_idx` ON `ciphers` (`user_uuid`,`deleted_at`,`archived_at`,`updated_at`);--> statement-breakpoint
CREATE TABLE `devices` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`system_name` text,
	`note` text,
	`type` integer NOT NULL,
	`identifier` text NOT NULL,
	`refresh_token` text NOT NULL,
	`refresh_token_hash` text,
	`trusted_at` integer,
	`trusted_until` integer,
	`last_seen_at` integer,
	`revoked_at` integer,
	`push_token` text,
	`access_token_expiration` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_user_identifier_idx` ON `devices` (`user_uuid`,`identifier`);--> statement-breakpoint
CREATE INDEX `devices_user_activity_idx` ON `devices` (`user_uuid`,`revoked_at`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `domain_settings` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`equivalent_domains` text DEFAULT '[]' NOT NULL,
	`custom_equivalent_domains` text DEFAULT '[]' NOT NULL,
	`excluded_global_domain_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
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
CREATE UNIQUE INDEX `folder_ciphers_cipher_uuid_idx` ON `folder_ciphers` (`cipher_uuid`);--> statement-breakpoint
CREATE INDEX `folder_ciphers_folder_uuid_idx` ON `folder_ciphers` (`folder_uuid`);--> statement-breakpoint
CREATE TABLE `folders` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_status` integer,
	`response_body` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_scope_key_idx` ON `idempotency_records` (`scope`,`key`);--> statement-breakpoint
CREATE INDEX `idempotency_expires_at_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idempotency_user_uuid_idx` ON `idempotency_records` (`user_uuid`);--> statement-breakpoint
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
CREATE INDEX `reauth_nonce_user_expiry_idx` ON `reauth_proof_nonces` (`user_uuid`,`expires_at`);--> statement-breakpoint
CREATE INDEX `reauth_nonce_active_idx` ON `reauth_proof_nonces` (`uuid`,`consumed_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `recovery_code_hashes` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_code_user_active_idx` ON `recovery_code_hashes` (`user_uuid`,`consumed_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `send_files_send_uuid_idx` ON `send_files` (`send_uuid`);--> statement-breakpoint
CREATE INDEX `send_files_pending_expiry_idx` ON `send_files` (`status`,`upload_expires_at`);--> statement-breakpoint
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
CREATE INDEX `sends_user_updated_idx` ON `sends` (`user_uuid`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sends_public_access_idx` ON `sends` (`uuid`,`disabled`,`deletion_date`,`expiration_date`);--> statement-breakpoint
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
CREATE INDEX `two_factor_user_status_idx` ON `two_factor_credentials` (`user_uuid`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_credential_id_idx` ON `two_factor_credentials` (`credential_id`);--> statement-breakpoint
CREATE TABLE `user_revisions` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`revision_date` integer NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`uuid` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
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