import { AttendanceRow } from "../attendance-row";
import { Card } from "@/components/ui/card";

export default function AttendanceRowExample() {
  return (
    <div className="p-4">
      <Card>
        <AttendanceRow
          id="1"
          staffName="Sarah Johnson"
          initials="SJ"
          site="Kent Site"
          clockIn="08:05"
          clockOut="16:10"
          status="late"
          duration="8h 5m"
        />
        <AttendanceRow
          id="2"
          staffName="Mike Chen"
          initials="MC"
          site="London Site"
          clockIn="14:00"
          status="on-time"
          onApprove={() => console.log("Approved")}
          onReject={() => console.log("Rejected")}
        />
        <AttendanceRow
          id="3"
          staffName="Emma Wilson"
          initials="EW"
          site="Essex Site"
          clockIn="07:55"
          clockOut="16:00"
          status="pending-approval"
          duration="8h 5m"
          onApprove={() => console.log("Approved")}
          onReject={() => console.log("Rejected")}
        />
      </Card>
    </div>
  );
}
