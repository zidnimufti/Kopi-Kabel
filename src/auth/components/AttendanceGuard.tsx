import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@heroui/react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { hasValidAttendanceNow } from '../../api/attandance';

/**
 * AttendanceGuard
 * - Admin dilewati (tidak perlu absen).
 * - Barista wajib punya absen yang MASIH BERLAKU untuk shift saat ini.
 *   Absen Shift 1 tidak otomatis berlaku untuk Shift 2, sehingga barista yang
 *   hanya bertugas 1 shift tidak tercatat long shift karena lupa logout.
 *   Yang belum absen diarahkan ke /app/verify-attendance.
 */
const AttendanceGuard = () => {
  const { user } = useAuth();
  const { profile, loadingProfile } = useProfile();
  const [checking, setChecking] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    if (!user || loadingProfile) return;

    if (profile?.role === 'admin') {
      setChecking(false);
      return;
    }

    hasValidAttendanceNow(user.id)
      .then((ok) => setNeedsVerification(!ok))
      .catch(() => setNeedsVerification(true))
      .finally(() => setChecking(false));
  }, [user, profile, loadingProfile]);

  if (loadingProfile || checking) {
    return (
      <div className="h-screen flex items-center justify-center gap-2">
        <Spinner size="sm" /> Memeriksa status absensi…
      </div>
    );
  }

  if (needsVerification) {
    return <Navigate to="/app/verify-attendance" replace />;
  }

  return <Outlet />;
};

export default AttendanceGuard;