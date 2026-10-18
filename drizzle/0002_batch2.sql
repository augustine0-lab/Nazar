CREATE TABLE `bag_done` (
	`item_id` text NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`item_id`, `date`),
	FOREIGN KEY (`item_id`) REFERENCES `bag_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bag_items` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`icon` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `goal_pins` (
	`student_id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`set_by_id` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goal_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`author_id` text NOT NULL,
	`adult_text` text NOT NULL,
	`child_text` text NOT NULL,
	`place` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `health_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`sleep_hours` real,
	`medication` text,
	`author_id` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_unique_idx` ON `health_logs` (`student_id`,`date`);--> statement-breakpoint
CREATE TABLE `health_settings` (
	`student_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`changed_by_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`steps` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_notify` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_lang` text DEFAULT 'ru' NOT NULL;