-- Display texts in every language: {"ru": {"title","labels","highlights","price_suffix"}, "uk": {...}, ...}.
-- title/attribute_labels/highlights/price_suffix columns keep the default (ru) version.
ALTER TABLE listings ADD COLUMN i18n jsonb NOT NULL DEFAULT '{}';
