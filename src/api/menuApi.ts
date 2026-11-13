import { supabase } from './supabaseClient'; // Sesuaikan path jika perlu
import { Product } from '../types'; // Sesuaikan path jika perlu
import { compressImage, UPLOAD_CACHE_CONTROL } from './compressImage';

// Nama file unik & aman: tanpa spasi/karakter khusus. Wajib UNIK karena cache 1 tahun
// (gambar yang diganti harus memakai nama baru agar pengunjung tidak melihat gambar lama).
export const buildImagePath = (file: { type: string; name: string }, now: number = Date.now()) => {
  const fromType: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
  };
  const ext =
    fromType[file.type] ||
    (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg';
  const uid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `public/${now}-${uid}.${ext}`;
};

// Mengunggah gambar produk. Gambar DIPERKECIL dulu (WebP, lebar maks. 800 px) dan diberi
// cache 1 tahun. Bila pengecilan gagal / tidak lebih kecil, file asli yang diunggah.
export const uploadProductImage = async (file: File) => {
  const optimized = await compressImage(file);
  const filePath = buildImagePath(optimized);

  const { error: uploadError } = await supabase.storage
    .from('product-images') // Nama bucket yang kita buat
    .upload(filePath, optimized, {
      cacheControl: UPLOAD_CACHE_CONTROL,
      contentType: optimized.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  // Ambil URL publik dari file yang baru diunggah
  const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);

  return data.publicUrl;
};


// ... (Fungsi-fungsi lain seperti getProductsWithCategories, getCategories, dll. tetap ada) ...

export const getProductsWithCategories = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from('products')
    .select(`*, categories ( name )`);
  if (error) throw new Error(error.message);
  return data || [];
};

export const getCategories = async () => {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) throw new Error(error.message);
  return data || [];
};

export const addProduct = async (productData: Omit<Product, 'id' | 'created_at'>) => {
  const { data, error } = await supabase.from('products').insert([productData]).select();
  if (error) throw new Error(error.message);
  return data;
};

export const updateProduct = async (id: number, productData: Partial<Omit<Product, 'id' | 'created_at'>>) => {
  const { data, error } = await supabase.from('products').update(productData).eq('id', id).select();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteProduct = async (id: number) => {
  // 1. Hapus dulu semua order_items yang mereferensikan produk ini
  const { error: orderItemsError } = await supabase
    .from('order_items')
    .delete()
    .eq('product_id', id);

  if (orderItemsError) {
    throw new Error(`Gagal menghapus riwayat order terkait: ${orderItemsError.message}`);
  }

  // 2. Baru hapus produknya
  const { data, error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return data;
};
