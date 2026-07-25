CREATE TABLE `user_revisions` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`revision_date` integer NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
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
CREATE UNIQUE INDEX `idempotency_scope_key_idx` ON `idempotency_records` (`scope`,`key`);
--> statement-breakpoint
CREATE INDEX `idempotency_expires_at_idx` ON `idempotency_records` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idempotency_user_uuid_idx` ON `idempotency_records` (`user_uuid`);
-- Rollback (manual): DROP TABLE `idempotency_records`; DROP TABLE `user_revisions`;
-- Drop idempotency_records first because both tables reference users independently.
