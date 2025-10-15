import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { QrCode, Camera, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, RoomScan, Room } from "@shared/schema";

export default function WorkerScan() {
  const { toast } = useToast();
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ['/api/rooms'],
  });

  const { data: recentScans = [], isLoading: scansLoading } = useQuery<RoomScan[]>({
    queryKey: ['/api/room-scans', { userId: user?.id }],
    enabled: !!user,
  });

  const scanMutation = useMutation({
    mutationFn: async (qrCode: string) => {
      const room = rooms.find(r => r.qrCode === qrCode);
      
      if (!room) {
        throw new Error("Invalid QR code");
      }

      // Check if QR code is expired
      const expiryTime = new Date(room.qrCodeExpiry).getTime();
      const now = Date.now();
      
      if (now > expiryTime) {
        throw new Error("QR code has expired");
      }

      // Calculate confidence based on time remaining
      const timeRemaining = expiryTime - now;
      const totalValidity = 3600000; // 1 hour in ms
      const confidence = Math.floor((timeRemaining / totalValidity) * 100);

      const status = confidence > 80 ? 'verified' : confidence > 50 ? 'low-confidence' : 'failed';

      return apiRequest('POST', '/api/room-scans', {
        roomId: room.id,
        userId: user?.id,
        deviceId: navigator.userAgent.slice(0, 50), // Use user agent as device ID
        confidence,
        status,
        notes: status === 'low-confidence' ? 'QR code expiring soon' : undefined,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/room-scans'] });
      setManualCode("");
      setIsScanning(false);
      
      const status = data.status;
      toast({
        title: status === 'verified' ? "Scan Successful" : status === 'low-confidence' ? "Scan Completed (Low Confidence)" : "Scan Failed",
        description: status === 'verified' 
          ? "Room verified successfully" 
          : status === 'low-confidence'
          ? "QR code may be expiring soon"
          : "QR code verification failed",
        variant: status === 'failed' ? "destructive" : "default",
      });
    },
    onError: (error: Error) => {
      setIsScanning(false);
      toast({
        title: "Scan Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleManualScan = () => {
    if (!manualCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a room code",
        variant: "destructive",
      });
      return;
    }
    scanMutation.mutate(manualCode.trim());
  };

  const handleCameraScan = () => {
    setIsScanning(true);
    // In a real implementation, this would open the device camera
    // For now, we'll show a placeholder message
    toast({
      title: "Camera Not Available",
      description: "Please use manual room code entry",
      variant: "default",
    });
    setIsScanning(false);
  };

  const getRoomName = (roomId: number) => {
    const room = rooms.find(r => r.id === roomId);
    return room?.name || "Unknown Room";
  };

  const statusIcons = {
    verified: <CheckCircle2 className="h-5 w-5 text-chart-5" />,
    'low-confidence': <AlertTriangle className="h-5 w-5 text-chart-1" />,
    failed: <XCircle className="h-5 w-5 text-destructive" />,
  };

  const statusColors = {
    verified: "bg-chart-5/10 text-chart-5 border-chart-5/20",
    'low-confidence': "bg-chart-1/10 text-chart-1 border-chart-1/20",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  };

  if (userLoading || roomsLoading) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <WorkerBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-scan-title">Room Scanner</h1>
          <p className="text-muted-foreground mt-1">Scan QR codes to verify room locations</p>
        </div>

        {/* Scanner Interface */}
        <Card className="border-2" data-testid="card-scanner">
          <CardContent className="p-6 space-y-6">
            {/* QR Scanner Display */}
            <div className="aspect-square max-w-md mx-auto bg-card border-2 border-dashed rounded-lg flex items-center justify-center">
              {isScanning ? (
                <div className="text-center">
                  <Camera className="h-16 w-16 mx-auto text-muted-foreground animate-pulse mb-3" />
                  <p className="text-sm text-muted-foreground">Accessing camera...</p>
                </div>
              ) : (
                <div className="text-center p-6">
                  <QrCode className="h-24 w-24 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Scan a room QR code or enter code manually
                  </p>
                </div>
              )}
            </div>

            {/* Camera Scan Button */}
            <Button 
              size="lg" 
              className="w-full min-h-14"
              onClick={handleCameraScan}
              disabled={isScanning || scanMutation.isPending}
              data-testid="button-camera-scan"
            >
              <Camera className="h-5 w-5 mr-2" />
              Scan with Camera
            </Button>

            {/* Manual Entry */}
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or enter manually</span>
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder="Enter room code..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="min-h-12 text-center font-mono text-lg"
                  data-testid="input-room-code"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleManualScan();
                    }
                  }}
                />
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full min-h-12"
                  onClick={handleManualScan}
                  disabled={scanMutation.isPending || !manualCode.trim()}
                  data-testid="button-manual-scan"
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  Verify Code
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Scans */}
        <Card data-testid="card-recent-scans">
          <CardHeader>
            <CardTitle className="text-lg">Recent Scans</CardTitle>
          </CardHeader>
          <CardContent>
            {scansLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : recentScans.length > 0 ? (
              <div className="space-y-3">
                {recentScans
                  .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
                  .slice(0, 10)
                  .map((scan) => (
                    <div
                      key={scan.id}
                      className="flex items-start gap-3 p-4 rounded-lg border hover-elevate"
                      data-testid={`scan-record-${scan.id}`}
                    >
                      <div className="mt-0.5">
                        {statusIcons[scan.status as keyof typeof statusIcons]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm">{getRoomName(scan.roomId)}</p>
                          <Badge 
                            variant="outline" 
                            className={statusColors[scan.status as keyof typeof statusColors]}
                          >
                            {scan.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(scan.scannedAt), 'EEE, d MMM • HH:mm')}
                          </span>
                        </div>
                        {scan.confidence !== undefined && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Confidence</span>
                              <span className="font-medium">{scan.confidence}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  scan.confidence > 80
                                    ? 'bg-chart-5'
                                    : scan.confidence > 50
                                    ? 'bg-chart-1'
                                    : 'bg-destructive'
                                }`}
                                style={{ width: `${scan.confidence}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {scan.notes && (
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            {scan.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No scans yet. Start scanning rooms to see your history.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <WorkerBottomNav />
    </div>
  );
}
