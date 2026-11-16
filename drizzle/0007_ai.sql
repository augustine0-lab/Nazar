CREATE TABLE `ai_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`student_id` text,
	`feature` text NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`fallback` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_calls_school_idx` ON `ai_calls` (`school_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_consents` (
	`student_id` text PRIMARY KEY NOT NULL,
	`allowed` integer NOT NULL,
	`changed_by_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`school_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`changed_by_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
