import { ClockInWidget } from "../clock-in-widget";
import { useState } from "react";

export default function ClockInWidgetExample() {
  const [isClockedIn, setIsClockedIn] = useState(false);

  return (
    <div className="p-4 max-w-md">
      <ClockInWidget
        isClockedIn={isClockedIn}
        currentSite="Kent Site"
        clockInTime="08:00"
        onClockIn={() => {
          console.log("Clocked in");
          setIsClockedIn(true);
        }}
        onClockOut={() => {
          console.log("Clocked out");
          setIsClockedIn(false);
        }}
      />
    </div>
  );
}
