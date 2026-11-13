// src/lib/compressImage.ts
// Perkecil gambar di browser SEBELUM diunggah ke Supabase Storage.
// Foto kamera/WhatsApp berukuran beberapa MB menjadi ~50-120 KB (WebP, lebar maks. 800 px).
//
// Pemakaian di halaman admin saat unggah gambar menu:
//
//   import { compressImage, UPLOAD_CACHE_CONTROL } from "@/lib/compressImage";
//
//   const optimized = await compressImage(file);
//   const path = `public/${Date.now()}-${crypto.randomUUID()}.${optimized.type === "image/webp" ? "webp" : "jpg"}`;
//   const { error } = await supabase.storage.from("product-images").upload(path, optimized, {
//     cacheControl: UPLOAD_CACHE_CONTROL,   // cache 1 tahun (bawaan hanya 1 jam)
//     contentType: optimized.type,
//   });
//
// PENTING: cache panjang aman HANYA bila setiap unggahan memakai nama file BARU (seperti di atas).

export interface CompressOptions {
  maxWidth?: number; // piksel
  quality?: number; // 0..1
}

/** Cache 1 tahun untuk file yang namanya unik. */
export const UPLOAD_CACHE_CONTROL = "31536000";

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Mengembalikan file yang sudah diperkecil. Bila bukan gambar, gagal diproses, atau hasilnya
 * tidak lebih kecil, file asli dikembalikan apa adanya (unggahan tidak pernah terhalang).
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxWidth = opts.maxWidth ?? 800;
  const quality = opts.quality ?? 0.8;

  if (!file.type.startsWith("image/")) return file;

  try {
    // createImageBitmap menghormati orientasi EXIF (foto potret dari HP tidak miring)
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let blob = await encode(canvas, "image/webp", quality);
    let ext = "webp";

    // Beberapa browser (mis. Safari lama) tidak bisa menulis WebP: pakai JPEG berlatar putih
    if (!blob || blob.type !== "image/webp") {
      const flat = document.createElement("canvas");
      flat.width = w;
      flat.height = h;
      const c2 = flat.getContext("2d");
      if (c2) {
        c2.fillStyle = "#ffffff";
        c2.fillRect(0, 0, w, h);
        c2.drawImage(canvas, 0, 0);
        blob = await encode(flat, "image/jpeg", quality);
        ext = "jpg";
      }
    }

    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "gambar";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}