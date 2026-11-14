CREATE TABLE `class_layouts` (
	`class_id` text PRIMARY KEY NOT NULL,
	`rows` integer NOT NULL,
	`cols` integer NOT NULL,
	`window_side` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `homework_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text NOT NULL,
	`student_id` text NOT NULL,
	`option` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`counter_option` text,
	`decided_by_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`homework_id`) REFERENCES `homework`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `homework_deals_hw_idx` ON `homework_deals` (`homework_id`);--> statement-breakpoint
CREATE TABLE `seatings` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`row` integer NOT NULL,
	`col` integer NOT NULL,
	`from_date` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seatings_student_date_idx` ON `seatings` (`student_id`,`from_date`);--> statement-breakpoint
CREATE TABLE `sound_trials` (
	`student_id` text PRIMARY KEY NOT NULL,
	`sound` text NOT NULL,
	`started_on` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `homework` ADD `est_minutes` integer;--> statement-breakpoint
ALTER TABLE `homework` ADD `actual_minutes` integer;--> statement-breakpoint
ALTER TABLE `self_checks` ADD `with_noise` integer;