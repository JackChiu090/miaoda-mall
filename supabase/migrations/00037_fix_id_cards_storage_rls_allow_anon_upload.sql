
DROP POLICY IF EXISTS "Authenticated users can upload id-cards" ON storage.objects;
CREATE POLICY "Anyone can upload id-cards" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'id-cards');
