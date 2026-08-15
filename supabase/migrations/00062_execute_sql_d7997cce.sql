DO $$
DECLARE
  r RECORD;
  found_count INTEGER;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public'
      AND c.data_type IN ('text','character varying','character','json','jsonb')
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text LIKE ''%横三竖四%''', r.table_name, r.column_name) INTO found_count;
    IF found_count > 0 THEN
      RAISE NOTICE 'FOUND: table=%, column=%, count=%', r.table_name, r.column_name, found_count;
    END IF;
  END LOOP;
END $$;