// 图片上传工具 - 自动压缩超过1MB的图片为WEBP格式
import { supabase } from '@/db/supabase';

const MAX_SIZE = 1024 * 1024; // 1MB
const MAX_DIM = 1080;

async function compressImage(file: File): Promise<{ blob: Blob; compressed: boolean; finalSize: number }> {
  if (file.size <= MAX_SIZE) return { blob: file, compressed: false, finalSize: file.size };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      let w = width, h = height;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
        else { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('压缩失败')); return; }
          if (blob.size <= MAX_SIZE || quality <= 0.3) {
            resolve({ blob, compressed: true, finalSize: blob.size });
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, 'image/webp', quality);
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function safeFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext) ? ext : 'jpg';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${safeExt}`;
}

export interface UploadResult {
  url: string;
  compressed: boolean;
  finalSize: number;
}

export async function uploadProductImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  onProgress?.(10);
  const { blob, compressed, finalSize } = await compressImage(file);
  onProgress?.(40);

  const fileName = safeFileName(compressed ? 'img.webp' : file.name);
  const path = `products/${fileName}`;

  const uploadFile = compressed ? new File([blob], fileName, { type: 'image/webp' }) : file;
  const { error } = await supabase.storage.from('product-images').upload(path, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  });
  onProgress?.(90);
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  onProgress?.(100);
  return { url: data.publicUrl, compressed, finalSize };
}
