CREATE TABLE `class_boards` (
	`class_id` text PRIMARY KEY NOT NULL,
	`steps` text NOT NULL,
	`updated_by_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_supports` (
	`class_id` text NOT NULL,
	`support` text NOT NULL,
	`enabled_by_id` text NOT NULL,
	`enabled_at` integer NOT NULL,
	PRIMARY KEY(`class_id`, `support`),
	FOREIGN KEY (`class_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enabled_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `passports` (
	`student_id` text PRIMARY KEY NOT NULL,
	`strengths` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`helps` text DEFAULT '' NOT NULL,
	`hard` text DEFAULT '' NOT NULL,
	`calming` text DEFAULT '' NOT NULL,
	`family` text DEFAULT '' NOT NULL,
	`updated_by_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trials` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`technique_id` text NOT NULL,
	`lineage_id` text,
	`how_to` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`decision` text,
	`conclusion` text,
	`author_id` text NOT NULL,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technique_id`) REFERENCES `techniques`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trials_student_idx` ON `trials` (`student_id`,`start_date`);--> statement-breakpoint
ALTER TABLE `techniques` ADD `class_support` text;