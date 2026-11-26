-- Ultimate Premium Telegram Music Bot - MySQL 8.0+ Schema
CREATE DATABASE IF NOT EXISTS `premium_music_bot`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `premium_music_bot`;

-- 1. users
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `telegram_id` BIGINT NOT NULL,
  `username` VARCHAR(64) NULL,
  `first_name` VARCHAR(128) NOT NULL,
  `last_name` VARCHAR(128) NULL,
  `language_code` VARCHAR(12) NOT NULL DEFAULT 'en',
  `is_banned` TINYINT(1) NOT NULL DEFAULT 0,
  `total_requests` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_active_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_telegram_id` (`telegram_id`),
  KEY `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. groups
CREATE TABLE IF NOT EXISTS `groups` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chat_id` BIGINT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `username` VARCHAR(64) NULL,
  `invite_link` VARCHAR(255) NULL,
  `auto_join` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_groups_chat_id` (`chat_id`),
  KEY `idx_groups_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. admins
CREATE TABLE IF NOT EXISTS `admins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('owner', 'superadmin', 'admin', 'moderator') NOT NULL DEFAULT 'admin',
  `can_control_account` TINYINT(1) NOT NULL DEFAULT 0,
  `can_broadcast` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_user_id` (`user_id`),
  CONSTRAINT `fk_admins_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. music_queue
CREATE TABLE IF NOT EXISTS `music_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT UNSIGNED NOT NULL,
  `requested_by_user_id` BIGINT UNSIGNED NULL,
  `song_title` VARCHAR(255) NOT NULL,
  `artist_name` VARCHAR(255) NOT NULL DEFAULT 'Unknown Artist',
  `source_type` ENUM('direct_url', 'stream_link', 'mp3_file', 'library') NOT NULL DEFAULT 'direct_url',
  `source_url` TEXT NOT NULL,
  `duration_sec` INT UNSIGNED NOT NULL DEFAULT 0,
  `queue_position` INT UNSIGNED NOT NULL DEFAULT 1,
  `status` ENUM('queued', 'playing', 'paused', 'completed', 'skipped') NOT NULL DEFAULT 'queued',
  `repeat_mode` ENUM('off', 'one', 'all') NOT NULL DEFAULT 'off',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_queue_group_status` (`group_id`, `status`, `queue_position`),
  CONSTRAINT `fk_queue_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_queue_user` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. music_history
CREATE TABLE IF NOT EXISTS `music_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT UNSIGNED NOT NULL,
  `requested_by_user_id` BIGINT UNSIGNED NULL,
  `song_title` VARCHAR(255) NOT NULL,
  `artist_name` VARCHAR(255) NOT NULL DEFAULT 'Unknown Artist',
  `duration_sec` INT UNSIGNED NOT NULL DEFAULT 0,
  `played_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_group_played` (`group_id`, `played_at`),
  CONSTRAINT `fk_history_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_history_user` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. account_sessions (encrypted MTProto metadata only, never plain session strings)
CREATE TABLE IF NOT EXISTS `account_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_label` VARCHAR(128) NOT NULL,
  `telegram_user_id` BIGINT NULL,
  `username` VARCHAR(64) NULL,
  `display_name` VARCHAR(128) NULL,
  `encrypted_session_blob` TEXT NULL,
  `connection_status` ENUM('connected', 'connecting', 'disconnected', 'reconnecting', 'error') NOT NULL DEFAULT 'disconnected',
  `is_online` TINYINT(1) NOT NULL DEFAULT 0,
  `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `last_heartbeat_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. live_sessions
CREATE TABLE IF NOT EXISTS `live_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT UNSIGNED NOT NULL,
  `account_session_id` BIGINT UNSIGNED NOT NULL,
  `voice_chat_link` VARCHAR(512) NOT NULL,
  `status` ENUM('joining', 'active', 'paused', 'recovering', 'ended', 'failed') NOT NULL DEFAULT 'joining',
  `current_track_title` VARCHAR(255) NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_live_status` (`status`, `started_at`),
  CONSTRAINT `fk_live_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_live_account` FOREIGN KEY (`account_session_id`) REFERENCES `account_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. volume_settings
CREATE TABLE IF NOT EXISTS `volume_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT UNSIGNED NOT NULL,
  `volume_percent` SMALLINT UNSIGNED NOT NULL DEFAULT 80,
  `is_muted` TINYINT(1) NOT NULL DEFAULT 0,
  `previous_volume` SMALLINT UNSIGNED NOT NULL DEFAULT 80,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_volume_group` (`group_id`),
  CONSTRAINT `fk_volume_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. bot_settings
CREATE TABLE IF NOT EXISTS `bot_settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. owner_settings
CREATE TABLE IF NOT EXISTS `owner_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_telegram_id` BIGINT NOT NULL,
  `maintenance_mode` TINYINT(1) NOT NULL DEFAULT 0,
  `max_concurrent_streams` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `auto_reconnect_limit` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_owner_tid` (`owner_telegram_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. error_logs
CREATE TABLE IF NOT EXISTS `error_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `component` VARCHAR(64) NOT NULL,
  `severity` ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'error',
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_error_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. statistics
CREATE TABLE IF NOT EXISTS `statistics` (
  `stat_date` DATE NOT NULL,
  `tracks_played` INT UNSIGNED NOT NULL DEFAULT 0,
  `live_joins` INT UNSIGNED NOT NULL DEFAULT 0,
  `commands_handled` INT UNSIGNED NOT NULL DEFAULT 0,
  `errors_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `bot_settings` (`setting_key`, `setting_value`) VALUES
  ('default_volume', '80'),
  ('animation_delay_ms', '550'),
  ('allow_public_play', '1')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);
