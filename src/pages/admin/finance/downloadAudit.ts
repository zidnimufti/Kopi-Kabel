// src/pages/admin/finance/downloadAudit.ts
// Lapisan tipis: mengubah SheetSpec (dari auditSpecs.ts) menjadi file .xlsx dan mengunduhnya.

import * as XLSX from "xlsx";
import type { Cell, SheetSpec } from "./auditSpecs";

export function specsToWorkbook(specs: SheetSpec[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  specs.forEach((spec) => {
    const ws: XLSX.WorkSheet = {};
    let maxCol = 0;

    spec.rows.forEach((row: Cell[], r: number) => {
      row.forEach((cell: Cell, c: number) => {
        if (cell === null || cell === undefined) return;

        const obj = typeof cell === "object" ? cell : { v: cell };
        if (obj.v === null && !obj.f) return;
        if (obj.v === "" && !obj.f) return;

        const out: XLSX.CellObject =
          typeof obj.v === "number"
            ? { t: "n", v: obj.v }
            : { t: "s", v: obj.v === null ? "" : String(obj.v) };

        if (obj.f) out.f = obj.f;
        if (obj.z) out.z = obj.z;

        ws[XLSX.utils.encode_cell({ r, c })] = out;
        if (c > maxCol) maxCol = c;
      });
    });

    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, spec.rows.length - 1), c: maxCol },
    });
    if (spec.colWidths) ws["!cols"] = spec.colWidths.map((wch) => ({ wch }));
    if (spec.autofilter) ws["!autofilter"] = { ref: spec.autofilter };

    XLSX.utils.book_append_sheet(wb, ws, spec.name);
  });

  return wb;
}

export function downloadAuditWorkbook(specs: SheetSpec[], filename: string) {
  XLSX.writeFile(specsToWorkbook(specs), filename);
}