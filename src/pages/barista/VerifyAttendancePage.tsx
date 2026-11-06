import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Input, Button } from '@heroui/react';
import { useAuth } from '../../auth/hooks/useAuth';
import { verifyPinAndClockIn, Shift } from '../../api/attandance';
import { OUTLETS } from '../../config/outlets';

export default function VerifyAttendancePage() {
  const auth = useAuth() as any;
  const navigate = useNavigate();

  const [pin, setPin] = useState('');
  const [shift, setShift] = useState<Shift | null>(null);
  const [outletId, setOutletId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
              Masukkan kode PIN, pilih shift dan lantai tempat Anda bertugas hari ini.
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
              <Button
                className="flex-1"
                color={shift === 'Shift 1' ? 'primary' : 'default'}
                variant={shift === 'Shift 1' ? 'solid' : 'flat'}
                onPress={() => setShift('Shift 1')}
              >
                Shift 1
              </Button>
              <Button
                className="flex-1"
                color={shift === 'Shift 2' ? 'primary' : 'default'}
                variant={shift === 'Shift 2' ? 'solid' : 'flat'}
                onPress={() => setShift('Shift 2')}
              >
                Shift 2
              </Button>
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