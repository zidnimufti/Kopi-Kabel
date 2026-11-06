import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Input, Button } from '@heroui/react';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  verifyPinAndClockIn,
  getSelectableShifts,
  getTodayOutletId,
  SHIFT_WINDOWS,
  Shift,
} from '../../api/attandance';
import { OUTLETS } from '../../config/outlets';

const ALL_SHIFTS: Shift[] = ['Shift 1', 'Shift 2'];

export default function VerifyAttendancePage() {
  const auth = useAuth() as any;
  const navigate = useNavigate();

  // Hanya shift yang sesuai jam sekarang yang bisa dipilih
  const selectable = getSelectableShifts();

  const [pin, setPin] = useState('');
  const [shift, setShift] = useState<Shift | null>(
    selectable.length === 1 ? selectable[0] : null
  );
  const [outletId, setOutletId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Isi otomatis lantai dari absen sebelumnya hari ini (mis. lanjut ke shift 2)
  useEffect(() => {
    const uid = auth?.user?.id;
    if (!uid) return;
    getTodayOutletId(uid)
      .then((id) => id && setOutletId((cur) => cur ?? id))
      .catch(() => {});
  }, [auth?.user?.id]);

  const handleSubmit = async () => {
    if (!pin || !shift || !outletId) {
      setError('Isi PIN, pilih shift, dan pilih lantai terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyPinAndClockIn(auth.user.id, pin, shift, outletId);
      navigate('/app/barista', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Gagal memverifikasi absen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-bold">Verifikasi Absen</h1>
            <p className="text-sm text-default-500">
              Masukkan kode PIN, pilih shift dan lantai tempat Anda bertugas. Jika Anda
              bertugas di dua shift, absen dilakukan untuk setiap shift.
            </p>
          </div>

          <Input
            label="Kode PIN"
            type="password"
            maxLength={6}
            value={pin}
            onValueChange={setPin}
          />

          <div className="space-y-1">
            <p className="text-sm text-default-600">Shift</p>
            <div className="flex gap-2">
              {ALL_SHIFTS.map((s) => {
                const enabled = selectable.includes(s);
                return (
                  <Button
                    key={s}
                    className="flex-1 h-auto py-2"
                    isDisabled={!enabled}
                    color={shift === s ? 'primary' : 'default'}
                    variant={shift === s ? 'solid' : 'flat'}
                    onPress={() => setShift(s)}
                  >
                    <span className="flex flex-col leading-tight">
                      <span>{s}</span>
                      <span className="text-tiny opacity-70">{SHIFT_WINDOWS[s].label}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-default-600">Lantai bertugas</p>
            <div className="flex gap-2">
              {OUTLETS.map((o) => (
                <Button
                  key={o.id}
                  className="flex-1"
                  color={outletId === o.id ? 'primary' : 'default'}
                  variant={outletId === o.id ? 'solid' : 'flat'}
                  onPress={() => setOutletId(o.id)}
                >
                  {o.name}
                </Button>
              ))}
            </div>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <Button color="primary" fullWidth isLoading={loading} onPress={handleSubmit}>
            Konfirmasi Absen Masuk
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}