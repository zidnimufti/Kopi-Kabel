// src/config/outlets.ts
// id HARUS sama dengan tabel public.outlets di database.

export interface Outlet {
  id: number;
  name: string;
}

export const OUTLETS: Outlet[] = [
  { id: 1, name: "Lantai 1" },
  { id: 2, name: "Lantai 2" },
];

export const isValidOutletId = (n: unknown): n is number =>
  typeof n === "number" && OUTLETS.some((o) => o.id === n);