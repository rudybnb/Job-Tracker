import { RoomScanLog } from "../room-scan-log";
import { Card } from "@/components/ui/card";

export default function RoomScanLogExample() {
  return (
    <div className="p-4">
      <Card>
        <RoomScanLog
          id="1"
          roomName="Room 101 - Patient Ward"
          staffName="Sarah Johnson"
          timestamp="22:30"
          confidence={98}
          deviceId="KIOSK-01"
          status="verified"
        />
        <RoomScanLog
          id="2"
          roomName="Room 205 - Common Area"
          staffName="Mike Chen"
          timestamp="23:00"
          confidence={75}
          deviceId="MOBILE-42"
          status="low-confidence"
        />
        <RoomScanLog
          id="3"
          roomName="Room 310 - Storage"
          staffName="Emma Wilson"
          timestamp="23:30"
          confidence={45}
          deviceId="KIOSK-02"
          status="failed"
        />
      </Card>
    </div>
  );
}
