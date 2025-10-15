import { QueryTicket } from "../query-ticket";

export default function QueryTicketExample() {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 max-w-2xl">
      <QueryTicket
        id="1"
        subject="Missing overtime payment"
        description="I worked 5 hours overtime last week but it's not showing in my payslip. Can someone check?"
        staffName="Sarah Johnson"
        category="pay"
        status="open"
        createdAt="2 hours ago"
        relatedTo="Week 15 Payslip"
        onClick={() => console.log("Ticket clicked")}
      />
      <QueryTicket
        id="2"
        subject="Holiday request approval"
        description="Submitted holiday request for next month but haven't received confirmation yet."
        staffName="Mike Chen"
        category="hr"
        status="in-progress"
        createdAt="1 day ago"
        onClick={() => console.log("Ticket clicked")}
      />
      <QueryTicket
        id="3"
        subject="Shift swap request"
        description="Need to swap my Thursday shift with Emma. Both parties agreed."
        staffName="David Brown"
        category="schedule"
        status="resolved"
        createdAt="3 days ago"
        onClick={() => console.log("Ticket clicked")}
      />
    </div>
  );
}
