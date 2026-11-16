-- Supabase grants anon/authenticated access to new tables by default.
-- Revoke those default privileges so any table added by a future migration is
-- also invisible to the public Data API unless deliberately exposed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
    EXECUTE 'ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public._prisma_migrations FROM anon, authenticated';
  END IF;
END $$;
