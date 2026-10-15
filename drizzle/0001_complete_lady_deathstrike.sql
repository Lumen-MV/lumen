ALTER TABLE `device_tokens` ADD `last_used_at` integer;--> statement-breakpoint
ALTER TABLE `invites` ADD `token` text;