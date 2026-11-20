-- Base extensions and settings for the Ryoko platform database.
CREATE EXTENSION IF NOT EXISTS citext;
ALTER DATABASE ryoko SET timezone TO 'UTC';
