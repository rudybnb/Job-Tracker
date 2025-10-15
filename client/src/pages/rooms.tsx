import { QRScanner } from "@/components/qr-scanner";
import { RoomScanLog } from "@/components/room-scan-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Rooms() {
  //todo: remove mock functionality
  const mockRooms = [
    { roomName: "Room 101 - Patient Ward", roomId: "101" },
    { roomName: "Room 205 - Common Area", roomId: "205" },
    { roomName: "Room 310 - Storage", roomId: "310" },
  ];

  const mockScans = [
    {
      id: "1",
      roomName: "Room 101 - Patient Ward",
      staffName: "Sarah Johnson",
      timestamp: "22:30",
      confidence: 98,
      deviceId: "KIOSK-01",
      status: "verified" as const,
    },
    {
      id: "2",
      roomName: "Room 205 - Common Area",
      staffName: "Mike Chen",
      timestamp: "23:00",
      confidence: 75,
      deviceId: "MOBILE-42",
      status: "low-confidence" as const,
    },
    {
      id: "3",
      roomName: "Room 310 - Storage",
      staffName: "Emma Wilson",
      timestamp: "23:30",
      confidence: 45,
      deviceId: "KIOSK-02",
      status: "failed" as const,
    },
    {
      id: "4",
      roomName: "Room 101 - Patient Ward",
      staffName: "David Brown",
      timestamp: "00:00",
      confidence: 96,
      deviceId: "KIOSK-01",
      status: "verified" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Room Scans</h1>
        <p className="text-muted-foreground mt-1">
          QR code scanning for room entry monitoring
        </p>
      </div>

      <Tabs defaultValue="qr-codes" className="w-full">
        <TabsList>
          <TabsTrigger value="qr-codes" data-testid="tab-qr-codes">
            QR Codes
          </TabsTrigger>
          <TabsTrigger value="scan-log" data-testid="tab-scan-log">
            Scan Log ({mockScans.length})
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qr-codes" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockRooms.map((room) => (
              <QRScanner
                key={room.roomId}
                {...room}
                onRefresh={() => console.log("Refreshed QR for", room.roomId)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scan-log" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Scans</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {mockScans.map((scan) => (
                <RoomScanLog key={scan.id} {...scan} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Room Rounds Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                Compliance tracking coming soon
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
