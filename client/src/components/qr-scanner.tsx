import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

interface QRScannerProps {
  roomName: string;
  roomId: number;
  qrCode: string;
  qrCodeExpiry: string;
  onRefresh?: () => void;
}

export function QRScanner({ roomName, roomId, qrCode, qrCodeExpiry, onRefresh }: QRScannerProps) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const expiryTime = new Date(qrCodeExpiry).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
      return diff;
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);
      
      if (newTimeLeft <= 0) {
        onRefresh?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [qrCodeExpiry, onRefresh]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <Card data-testid={`qr-scanner-${roomId}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{roomName}</CardTitle>
          <Badge variant="outline" className="font-mono">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <div className="w-64 h-64 bg-background border-2 border-border rounded-lg flex items-center justify-center">
            <QrCode className="h-48 w-48 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground text-center font-mono break-all max-w-64">
            {qrCode}
          </p>
          <Button
            variant="outline"
            onClick={onRefresh}
            className="w-full"
            data-testid={`button-refresh-qr-${roomId}`}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Generate New Code
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
