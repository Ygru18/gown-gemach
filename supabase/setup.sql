-- One-time Supabase project setup for the Gown Gemach.
-- Run in the Supabase SQL editor (as the default `postgres` role) BEFORE the
-- first deployment. Replace <CHOOSE-A-STRONG-PASSWORD> first.

-- 1. A dedicated database role for the app. It owns the application tables
--    (they are created by `prisma migrate deploy` using this role), which is
--    why the app's own queries are unaffected by the deny-all RLS that blocks
--    Supabase's public REST API.
CREATE ROLE gemach_app WITH LOGIN PASSWORD '<CHOOSE-A-STRONG-PASSWORD>';
GRANT USAGE, CREATE ON SCHEMA public TO gemach_app;
GRANT CONNECT ON DATABASE postgres TO gemach_app;
-- Lets the dashboard SQL editor (postgres role) read/maintain app tables.
GRANT gemach_app TO postgres;

-- 2. Extension used by the double-booking exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 3. Private bucket for gown photographs (no public access, JPEG only, 10 MB max).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gown-photos', 'gown-photos', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg'];
-- No storage.objects policies are created on purpose: browsers can only
-- upload/read through short-lived signed URLs issued by the server after its
-- own permission check.
