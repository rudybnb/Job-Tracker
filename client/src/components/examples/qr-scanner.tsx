import { QRScanner } from "../qr-scanner";

export default function QRScannerExample() {
  return (
    <div className="p-4 max-w-md">
      <QRScanner
        roomName="Room 101 - Patient Ward"
        roomId="101"
        onRefresh={() => console.log("QR code refreshed")}
      />
    </div>
  );
}
