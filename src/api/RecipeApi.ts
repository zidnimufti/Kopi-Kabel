// src/api/recipeApi.ts
// Resep per menu dan harga bahan (khusus admin; dilindungi RLS dan fungsi save_recipe).

import { supabase } from "./supabaseClient";

export type RecipeSize = "regular" | "large";

export interface ItemRow {
  id: string;
  name: string;
  unit: string;
  /** Rp per satuan; null = belum diisi */
  cost_per_unit: number | null;
}

export interface RecipeRow {
  product_id: number;
  size: RecipeSize;
  item_id: string;
  qty: number;
}

export interface MenuRow {
  id: number;
  name: string;
  price: number;
  price_large: number | null;
  discount: number | null;
}

export interface RecipeData {
  items: ItemRow[];
  recipes: RecipeRow[];
  menus: MenuRow[];
}

export async function getRecipeData(): Promise<RecipeData> {
  const [itemsRes, costsRes, recipesRes, productsRes] = await Promise.all([
    supabase.from("items").select("id, name, unit").order("name"),
    supabase.from("item_costs").select("item_id, cost_per_unit"),
    supabase.from("recipe_items").select("product_id, size, item_id, qty"),
    supabase
      .from("products")
      .select("id, name, price, price_large, discount, is_deleted")
      .order("name"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (costsRes.error) throw costsRes.error;
  if (recipesRes.error) throw recipesRes.error;
  if (productsRes.error) throw productsRes.error;

  const costById = new Map<string, number>(
    ((costsRes.data ?? []) as any[]).map((c) => [String(c.item_id), Number(c.cost_per_unit)]),
  );

  const items: ItemRow[] = ((itemsRes.data ?? []) as any[]).map((i) => ({
    id: String(i.id),
    name: String(i.name),
    unit: String(i.unit ?? ""),
    cost_per_unit: costById.has(String(i.id)) ? (costById.get(String(i.id)) as number) : null,
  }));

  const recipes: RecipeRow[] = ((recipesRes.data ?? []) as any[]).map((r) => ({
    product_id: Number(r.product_id),
    size: r.size === "large" ? "large" : "regular",
    item_id: String(r.item_id),
    qty: Number(r.qty),
  }));

  const menus: MenuRow[] = ((productsRes.data ?? []) as any[])
    .filter((p) => !p.is_deleted)
    .map((p) => ({
      id: Number(p.id),
      name: String(p.name),
      price: Number(p.price),
      price_large: p.price_large === null || p.price_large === undefined ? null : Number(p.price_large),
      discount: p.discount === null || p.discount === undefined ? null : Number(p.discount),
    }));

  return { items, recipes, menus };
}

/** Simpan harga per satuan bahan. null menghapus harga (menjadi "belum diisi"). */
export async function saveItemCost(itemId: string, cost: number | null): Promise<void> {
  if (cost === null) {
    const { error } = await supabase.from("item_costs").delete().eq("item_id", itemId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("item_costs")
    .upsert({ item_id: itemId, cost_per_unit: cost }, { onConflict: "item_id" });
  if (error) throw error;
}

/** Tambah bahan baru (tampil juga di halaman Stok). Harga per satuan boleh dikosongkan. */
export async function addItem(
  name: string,
  unit: string,
  cost: number | null,
): Promise<string> {
  const { data, error } = await supabase
    .from("items")
    .insert({ name: name.trim(), unit, min_stock: 0 })
    .select("id")
    .single();
  if (error) throw error;

  const id = String((data as any).id);
  if (cost !== null) await saveItemCost(id, cost);
  return id;
}

/** Simpan resep satu menu dan ukuran. Daftar kosong menghapus resep itu. */
export async function saveRecipe(
  productId: number,
  size: RecipeSize,
  lines: { item_id: string; qty: number }[],
): Promise<void> {
  const { error } = await supabase.rpc("save_recipe", {
    p_product: productId,
    p_size: size,
    p_lines: lines,
  });
  if (error) throw error;
}