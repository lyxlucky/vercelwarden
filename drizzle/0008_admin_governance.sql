ALTER TABLE `admin_invites` ADD `max_uses` integer DEFAULT 1 NOT NULL;
ALTER TABLE `admin_invites` ADD `use_count` integer DEFAULT 0 NOT NULL;
ALTER TABLE `admin_invites` ADD `last_used_at` integer;
UPDATE `admin_invites` SET `use_count` = 1, `last_used_at` = `used_at` WHERE `used_at` IS NOT NULL;

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
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);
CREATE INDEX `audit_events_category_created_idx` ON `audit_events` (`category`,`created_at`);
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_user_uuid`,`created_at`);
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_type`,`target_id`,`created_at`);

CREATE TABLE `audit_retention_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`retention_days` integer,
	`max_entries` integer,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE set null
);

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
CREATE INDEX `backup_destinations_enabled_idx` ON `backup_destinations` (`enabled`);

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
CREATE INDEX `backup_runs_status_created_idx` ON `backup_runs` (`status`,`created_at`);
CREATE INDEX `backup_runs_destination_created_idx` ON `backup_runs` (`destination_uuid`,`created_at`);

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
CREATE UNIQUE INDEX `backup_artifacts_object_key_idx` ON `backup_artifacts` (`object_key`);
CREATE INDEX `backup_artifacts_run_idx` ON `backup_artifacts` (`run_uuid`);
CREATE INDEX `backup_artifacts_expiry_idx` ON `backup_artifacts` (`expires_at`);
