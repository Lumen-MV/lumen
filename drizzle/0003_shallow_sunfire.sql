CREATE TABLE `release_prefs` (
	`user_id` integer NOT NULL,
	`media_key` text NOT NULL,
	`hash` text NOT NULL,
	`file_id` integer,
	`label` text DEFAULT '' NOT NULL,
	`quality` text DEFAULT '' NOT NULL,
	`release_group` text DEFAULT '' NOT NULL,
	`play_class` text DEFAULT 'direct' NOT NULL,
	`episode_media_key` text,
	`chosen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `media_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
