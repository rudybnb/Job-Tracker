import { ShiftCard } from "../shift-card";

export default function ShiftCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      <ShiftCard
        id="1"
        staffName="Sarah Johnson"
        role="Care Assistant"
        site="Kent"
        siteColor="purple"
        startTime="08:00"
        endTime="16:00"
        status="scheduled"
        duration="8h"
      />
      <ShiftCard
        id="2"
        staffName="Mike Chen"
        role="Senior Care"
        site="London"
        siteColor="teal"
        startTime="14:00"
        endTime="22:00"
        status="in-progress"
        duration="8h"
      />
      <ShiftCard
        id="3"
        staffName="Emma Wilson"
        role="Nurse"
        site="Essex"
        siteColor="orange"
        startTime="22:00"
        endTime="06:00"
        status="conflict"
        duration="8h"
      />
    </div>
  );
}
