CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` integer NOT NULL,
	`kind` text NOT NULL,
	`actor_name` text NOT NULL,
	`course_title` text NOT NULL,
	`href` text NOT NULL,
	`sent_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_id`,`sent_at`);