
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exchange-images',
  'exchange-images',
  true,
  1048576,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='exchange_images_public_read' AND tablename='objects'
  ) THEN
    CREATE POLICY "exchange_images_public_read"
      ON storage.objects FOR SELECT USING (bucket_id = 'exchange-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='exchange_images_admin_upload' AND tablename='objects'
  ) THEN
    CREATE POLICY "exchange_images_admin_upload"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'exchange-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='exchange_images_admin_delete' AND tablename='objects'
  ) THEN
    CREATE POLICY "exchange_images_admin_delete"
      ON storage.objects FOR DELETE USING (bucket_id = 'exchange-images');
  END IF;
END $$;
