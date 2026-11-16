-- One-time Supabase project setup for the Gown Gemach (already applied to the
-- production project). For a NEW project, run this in the Supabase SQL editor
-- before the first deployment; `prisma migrate deploy` then creates the tables.

-- Extension used by the double-booking exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Private bucket for gown photographs (no public access, JPEG only, 10 MB max).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gown-photos', 'gown-photos', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg'];
-- No storage.objects policies are created on purpose: browsers can only
-- upload/read through short-lived signed URLs issued by the server after its
-- own permission check.
