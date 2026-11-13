// src/pages/admin/recipes/calcRecipe.ts
// Perhitungan biaya resep (murni fungsi, tanpa tampilan).

export type Size = "regular" | "large";

export interface RecipeLine {
  itemId: string;
  qty: number;
}

export interface ItemInfo {
  id: string;
  name: string;
  unit: string;
  /** Rp per satuan; null = harga belum diisi */
  cost: number | null;
}

export interface RecipeCost {
  /** jumlah biaya bahan yang sudah punya harga */
  cost: number;
  /** jumlah baris bahan yang harganya belum diisi */
  missing: number;
  lines: number;
  /** true bila resep punya baris, dan semua bahannya sudah punya harga */
  complete: boolean;
}

/** Biaya satu porsi = jumlah (qty x harga per satuan). Bahan tanpa harga dihitung 0 dan dicatat di missing. */
export function recipeCost(lines: RecipeLine[], items: Map<string, ItemInfo>): RecipeCost {
  let cost = 0;
  let missing = 0;
  lines.forEach((l) => {
    const it = items.get(l.itemId);
    if (!it || it.cost === null) {
      missing += 1;
    } else {
      cost += l.qty * it.cost;
    }
  });
  return { cost, missing, lines: lines.length, complete: lines.length > 0 && missing === 0 };
}

/** Harga jual efektif satu porsi (setelah diskon); rumus sama dengan kasir & keranjang. */
export function effectivePrice(base: number, discount: number | null): number {
  return discount && discount > 0 ? Math.round(base - (base * discount) / 100) : base;
}

/** Margin kotor dalam persen; null bila harga jual 0. */
export function marginPct(price: number, cost: number): number | null {
  return price > 0 ? ((price - cost) / price) * 100 : null;
}

/**
 * Salin resep Regular ke Large dengan faktor pengali.
 * Bahan berhitung (pcs: gelas, tutup, sedotan) tidak dikalikan; bahan lain dikalikan.
 */
export function scaleRecipe(
  lines: RecipeLine[],
  factor: number,
  items: Map<string, ItemInfo>,
): RecipeLine[] {
  return lines.map((l) => {
    const unit = (items.get(l.itemId)?.unit ?? "").trim().toLowerCase();
    const countable = unit === "pcs" || unit === "pc" || unit === "buah";
    return { itemId: l.itemId, qty: countable ? l.qty : Math.round(l.qty * factor * 100) / 100 };
  });
}

/** Ubah "harga beli" dan "isi kemasan" menjadi harga per satuan. Null bila masukan tidak valid. */
export function costPerUnitFromPack(packPrice: number, packQty: number): number | null {
  if (!(packPrice >= 0) || !(packQty > 0)) return null;
  return packPrice / packQty;
}