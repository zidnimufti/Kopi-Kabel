import { supabase } from './supabaseClient';

export type Shift = 'Shift 1' | 'Shift 2';

/* =====================================================================
 * Jadwal shift (WIB), dalam menit sejak 00:00.
 * Satu barista boleh punya DUA absen dalam sehari (satu per shift).
 * Shift hanya dianggap bertugas bila barista benar-benar absen untuk shift itu,
 * jadi lupa logout tidak otomatis menjadi "long shift".
 * ===================================================================== */
export const SHIFT_WINDOWS: Record<Shift, { start: number; end: number; label: string }> = {
  'Shift 1': { start: 9 * 60, end: 13 * 60, label: '09.00–13.00' },
  'Shift 2': { start: 13 * 60, end: 17 * 60, label: '13.00–17.00' },
};

/** Toleransi absen lebih awal / pulang terlambat (menit) di sekitar jam shift */
const SHIFT_TOLERANCE_MIN = 30;

const SHIFTS: Shift[] = ['Shift 1', 'Shift 2'];

/** Tanggal & jam di zona waktu WIB, apa pun zona waktu perangkat */
const wibParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`, // YYYY-MM-DD (WIB)
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
};

/** Tanggal hari ini (WIB). Dipakai untuk attendance_date */
export const todayWIB = (d: Date = new Date()) => wibParts(d).date;

/**
 * Shift yang boleh dipilih saat ini.
 * - Dalam jendela shift (+/- toleransi) -> shift itu (bisa dua saat pergantian).
 * - Di luar semua jendela: sebelum jam masuk -> Shift 1, sesudah jam pulang -> Shift 2.
 * Halaman verifikasi dan AttendanceGuard memakai fungsi yang sama, jadi tidak
 * mungkin terjadi "absen berhasil tapi ditolak guard".
 */
export const getSelectableShifts = (d: Date = new Date()): Shift[] => {
  const t = wibParts(d).minutes;
  const open = SHIFTS.filter(
    (s) =>
      t >= SHIFT_WINDOWS[s].start - SHIFT_TOLERANCE_MIN &&
      t <= SHIFT_WINDOWS[s].end + SHIFT_TOLERANCE_MIN
  );
  if (open.length) return open;
  return t < SHIFT_WINDOWS['Shift 1'].start ? ['Shift 1'] : ['Shift 2'];
};

/** Apakah shift ini masih berlaku pada saat ini? */
export const isShiftValidNow = (shift: string | null | undefined, d: Date = new Date()) =>
  !!shift && (getSelectableShifts(d) as string[]).includes(shift);

/** Semua absen barista hari ini (urut dari yang paling awal) */
export const getTodayAttendanceRows = async (baristaId: string) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('barista_id', baristaId)
    .eq('attendance_date', todayWIB())
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
};

/** Absen TERBARU hari ini (null kalau belum absen) */
export const getTodayAttendance = async (baristaId: string) => {
  const rows = await getTodayAttendanceRows(baristaId);
  return rows.length ? rows[rows.length - 1] : null;
};

/** Apakah barista punya absen yang masih berlaku sekarang? (dipakai AttendanceGuard) */
export const hasValidAttendanceNow = async (baristaId: string) => {
  const rows = await getTodayAttendanceRows(baristaId);
  return rows.some((r) => isShiftValidNow(r.shift));
};

/** Outlet (lantai) pada absen terbaru hari ini; null bila belum dipilih */
export const getTodayOutletId = async (baristaId: string): Promise<number | null> => {
  const row = await getTodayAttendance(baristaId);
  return (row?.outlet_id as number | null | undefined) ?? null;
};

/** Pindah lantai di tengah shift (memanggil fungsi database set_my_outlet) */
export const setMyOutlet = async (outletId: number) => {
  const { error } = await supabase.rpc('set_my_outlet', { p_outlet: outletId });
  if (error) throw new Error(error.message);
};

/** Verifikasi PIN lalu catat absen masuk untuk SHIFT yang dipilih */
export const verifyPinAndClockIn = async (
  baristaId: string,
  pin: string,
  shift: Shift,
  outletId: number
) => {
  if (!isShiftValidNow(shift)) {
    throw new Error(`${shift} tidak dapat dipilih pada jam ini.`);
  }

  // 1. Cek PIN cocok dengan yang tersimpan
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('pin_code')
    .eq('id', baristaId)
    .single();

  if (userError) throw new Error(userError.message);

  if (!userRow?.pin_code || userRow.pin_code !== pin) {
    throw new Error('Kode PIN salah. Silakan coba lagi.');
  }

  const rows = await getTodayAttendanceRows(baristaId);

  // 2. Sudah absen untuk shift ini? Jangan buat baris ganda; cukup samakan lantainya.
  const existing = rows.find((r) => r.shift === shift);
  if (existing) {
    if (existing.outlet_id !== outletId) {
      const { error: upErr } = await supabase
        .from('attendance')
        .update({ outlet_id: outletId })
        .eq('id', existing.id);
      if (upErr) throw new Error(upErr.message);
      existing.outlet_id = outletId;
    }
    return existing;
  }

  // 3. Tutup absen shift sebelumnya yang masih terbuka (mis. lupa absen pulang),
  //    sehingga tidak ada dua sesi terbuka sekaligus.
  const openIds = rows.filter((r) => !r.clock_out).map((r) => r.id);
  if (openIds.length) {
    const { error: closeErr } = await supabase
      .from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .in('id', openIds);
    if (closeErr) throw new Error(closeErr.message);
  }

  // 4. Catat absen masuk untuk shift ini
  const { data, error } = await supabase
    .from('attendance')
    .insert([
      { barista_id: baristaId, attendance_date: todayWIB(), shift, outlet_id: outletId },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

/** Absen pulang: tutup absen terbuka yang paling baru hari ini */
export const clockOutToday = async (baristaId: string) => {
  const rows = await getTodayAttendanceRows(baristaId);
  const open = [...rows].reverse().find((r) => !r.clock_out);
  if (!open) throw new Error('Tidak ada absen masuk yang masih aktif.');

  const { data, error } = await supabase
    .from('attendance')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', open.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

/** Untuk halaman admin: riwayat absensi 1 barista */
export const getAttendanceHistory = async (baristaId: string) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('barista_id', baristaId)
    .order('attendance_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
};

/** Admin: set/reset PIN untuk seorang barista */
export const setBaristaPin = async (baristaId: string, pin: string) => {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN harus berupa 4-6 digit angka.');
  }

  const { data, error } = await supabase
    .from('users')
    .update({ pin_code: pin })
    .eq('id', baristaId)
    .select();

  if (error) throw new Error(error.message);

  // Kalau data kosong, berarti 0 baris ter-update (kemungkinan besar diblokir RLS)
  if (!data || data.length === 0) {
    throw new Error(
      'PIN tidak tersimpan. Kemungkinan besar diblokir oleh RLS policy — cek policy UPDATE pada tabel users.'
    );
  }

  return true;
};

/** Admin: absensi hari ini untuk SEMUA barista sekaligus (bisa 2 baris per barista) */
export const getTodayAttendanceForAll = async () => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('attendance_date', todayWIB())
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
};