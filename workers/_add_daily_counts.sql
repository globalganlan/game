-- Add dailyCounts JSON column to save_data for tracking daily/pvp/boss attempt counts
-- Format: {"daily":0,"pvp":0,"boss":0,"date":"2026-03-04"}
ALTER TABLE save_data ADD COLUMN dailyCounts TEXT NOT NULL DEFAULT '{}';
