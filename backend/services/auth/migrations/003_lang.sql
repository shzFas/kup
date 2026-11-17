-- Interface language, also used for notifications and SMS texts.
ALTER TABLE users ADD COLUMN lang text NOT NULL DEFAULT 'ru';
