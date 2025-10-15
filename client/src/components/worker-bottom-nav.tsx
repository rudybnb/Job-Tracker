import { Home, Clock, DollarSign, QrCode, User } from "lucide-react";
import { Link, useLocation } from "wouter";

const navItems = [
  { title: "Home", url: "/worker", icon: Home },
  { title: "Clock", url: "/worker/clock", icon: Clock },
  { title: "Pay", url: "/worker/pay", icon: DollarSign },
  { title: "Scan", url: "/worker/scan", icon: QrCode },
  { title: "Profile", url: "/worker/profile", icon: User },
];

export function WorkerBottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-50 md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = location === item.url;
          return (
            <Link
              key={item.title}
              href={item.url}
              className={`flex flex-col items-center gap-1 p-3 flex-1 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`nav-${item.title.toLowerCase()}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
