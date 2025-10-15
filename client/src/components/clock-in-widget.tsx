import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin } from "lucide-react";
import { useState, useEffect } from "react";

interface ClockInWidgetProps {
  isClockedIn: boolean;
  currentSite?: string;
  clockInTime?: string;
  onClockIn?: () => void;
  onClockOut?: () => void;
}

export function ClockInWidget({
  isClockedIn,
  currentSite,
  clockInTime,
  onClockIn,
  onClockOut,
}: ClockInWidgetProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [duration, setDuration] = useState("0h 0m");

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());

      if (isClockedIn && clockInTime) {
        const start = new Date();
        const [hours, minutes] = clockInTime.split(":");
        start.setHours(parseInt(hours), parseInt(minutes), 0);
        const diff = new Date().getTime() - start.getTime();
        const h = Math.floor(diff / 1000 / 60 / 60);
        const m = Math.floor((diff / 1000 / 60) % 60);
        setDuration(`${h}h ${m}m`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isClockedIn, clockInTime]);

  return (
    <Card data-testid="clock-in-widget">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Time Clock</CardTitle>
          {isClockedIn && (
            <Badge className="bg-chart-5/10 text-chart-5 border-chart-5/20" variant="outline">
              <div className="w-2 h-2 rounded-full bg-chart-5 animate-pulse mr-2" />
              Clocked In
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center py-4">
          <p className="text-5xl font-bold font-mono">
            {currentTime.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {currentTime.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {isClockedIn && (
          <div className="bg-card rounded-lg p-4 space-y-2 border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Clock In Time</span>
              <span className="font-mono font-medium">{clockInTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duration</span>
              <span className="font-mono font-medium">{duration}</span>
            </div>
            {currentSite && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                <MapPin className="h-3 w-3" />
                <span>{currentSite}</span>
              </div>
            )}
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          variant={isClockedIn ? "destructive" : "default"}
          onClick={isClockedIn ? onClockOut : onClockIn}
          data-testid={isClockedIn ? "button-clock-out" : "button-clock-in"}
        >
          <Clock className="h-5 w-5 mr-2" />
          {isClockedIn ? "Clock Out" : "Clock In"}
        </Button>
      </CardContent>
    </Card>
  );
}
