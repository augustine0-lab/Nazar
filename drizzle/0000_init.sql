CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`student_id` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_student_idx` ON `audit_log` (`student_id`);--> statement-breakpoint
CREATE TABLE `class_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`name` text NOT NULL,
	`school_year` text NOT NULL,
	`teacher_id` text,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	`text_version` text NOT NULL,
	`given_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `day_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`date` text NOT NULL,
	`author_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_notes_unique_idx` ON `day_notes` (`student_id`,`date`,`author_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`adult_text` text NOT NULL,
	`child_text` text NOT NULL,
	`place` text DEFAULT 'SCHOOL' NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `support_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guardianships` (
	`parent_id` text NOT NULL,
	`student_id` text NOT NULL,
	`relation` text NOT NULL,
	PRIMARY KEY(`parent_id`, `student_id`),
	FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `homework` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `homework_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`homework_id` text NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	`done_at` integer,
	FOREIGN KEY (`homework_id`) REFERENCES `homework`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `marks` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`date` text NOT NULL,
	`lesson_no` integer NOT NULL,
	`value` text NOT NULL,
	`author_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marks_unique_idx` ON `marks` (`student_id`,`date`,`lesson_no`,`goal_id`);--> statement-breakpoint
CREATE INDEX `marks_student_date_idx` ON `marks` (`student_id`,`date`);--> statement-breakpoint
CREATE TABLE `plan_techniques` (
	`plan_id` text NOT NULL,
	`technique_id` text NOT NULL,
	PRIMARY KEY(`plan_id`, `technique_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `support_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`technique_id`) REFERENCES `techniques`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `psych_assignments` (
	`psychologist_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`psychologist_id`, `student_id`),
	FOREIGN KEY (`psychologist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reward_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`cost_at_grant` integer,
	`decided_by_id` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`cost` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bell_schedule` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `self_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`homework_id` text,
	`date` text NOT NULL,
	`on_task` integer NOT NULL,
	`star_awarded` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`homework_id`) REFERENCES `homework`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `self_checks_student_date_idx` ON `self_checks` (`student_id`,`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`class_id` text NOT NULL,
	`display_name` text NOT NULL,
	`birth_year` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `class_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `support_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`threshold_pct` integer DEFAULT 70 NOT NULL,
	`work_minutes` integer DEFAULT 10 NOT NULL,
	`break_minutes` integer DEFAULT 3 NOT NULL,
	`effective_from` text,
	`author_id` text NOT NULL,
	`approved_by_id` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_student_version_idx` ON `support_plans` (`student_id`,`version`);--> statement-breakpoint
CREATE TABLE `techniques` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`evidence` text NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`login` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_idx` ON `users` (`login`);