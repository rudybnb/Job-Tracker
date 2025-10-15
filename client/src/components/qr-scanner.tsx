import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

interface QRScannerProps {
  roomName: string;
  roomId: string;
  onRefresh?: () => void;
}

export function QRScanner({ roomName, roomId, onRefresh }: QRScannerProps) {
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [qrData, setQrData] = useState("");

  useEffect(() => {
    // Generate QR code data (simulated token)
    const token = `ROOM_${roomId}_${Date.now()}`;
    setQrData(token);

    // Countdown timer
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onRefresh?.();
          return 600;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [roomId, onRefresh]);

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
            {qrData}
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
