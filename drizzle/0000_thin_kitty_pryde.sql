CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `device_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_uses` integer DEFAULT 1,
	`use_count` integer DEFAULT 0 NOT NULL,
	`used_by` integer,
	`used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`media_type` text,
	`tmdb_id` integer,
	`season` integer,
	`episode` integer,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_label` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`remember` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_color` text DEFAULT '#2d6cdf' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`onboarded` integer DEFAULT false NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `cloud_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`hash` text NOT NULL,
	`torbox_torrent_id` integer,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer,
	`episode` integer,
	`title` text NOT NULL,
	`release_label` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`speed_bps` integer DEFAULT 0 NOT NULL,
	`eta_s` integer DEFAULT 0 NOT NULL,
	`error_msg` text,
	`app_queue_pos` integer,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `likes` (
	`user_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `media_type`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `my_list` (
	`user_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `media_type`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer DEFAULT 0 NOT NULL,
	`episode` integer DEFAULT 0 NOT NULL,
	`position_s` real DEFAULT 0 NOT NULL,
	`duration_s` real DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`device_label` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `media_type`, `tmdb_id`, `season`, `episode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subtitle_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_key` text NOT NULL,
	`lang` text NOT NULL,
	`source` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`source_file_id` text,
	`downloads` integer DEFAULT 0 NOT NULL,
	`vtt_path` text NOT NULL,
	`cue_count` integer DEFAULT 0 NOT NULL,
	`cost_vnd` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtitle_prefs` (
	`user_id` integer NOT NULL,
	`media_key` text NOT NULL,
	`offset_ms` integer DEFAULT 0 NOT NULL,
	`size` text DEFAULT 'M' NOT NULL,
	`selected_sub_id` integer,
	PRIMARY KEY(`user_id`, `media_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `title_sources` (
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer DEFAULT 0 NOT NULL,
	`episode` integer DEFAULT 0 NOT NULL,
	`best_class` text,
	`best_label` text,
	`cached_count` integer DEFAULT 0 NOT NULL,
	`release_count` integer DEFAULT 0 NOT NULL,
	`first_cached_at` integer,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`media_type`, `tmdb_id`, `season`, `episode`)
);
--> statement-breakpoint
CREATE TABLE `tmdb_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `torrent_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`torbox_torrent_id` integer,
	`files_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer,
	`episode` integer,
	`release_hash` text DEFAULT '' NOT NULL,
	`mode` text NOT NULL,
	`device_label` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`last_beat_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
