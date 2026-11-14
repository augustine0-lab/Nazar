CREATE TABLE `room_settings` (
	`student_id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`video` integer NOT NULL,
	`unsupervised` integer NOT NULL,
	`changed_by_id` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
