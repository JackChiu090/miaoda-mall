
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id_card_front_url TEXT,
  ADD COLUMN IF NOT EXISTS id_card_back_url  TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-cards', 'id-cards', false, 1048576,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload id-cards" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own id-cards" ON storage.objects;

CREATE POLICY "Authenticated users can upload id-cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-cards');

CREATE POLICY "Users can read own id-cards"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'id-cards' AND auth.uid()::text = (storage.foldername(name))[1]);
