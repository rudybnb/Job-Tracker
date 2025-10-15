import { WorkerBottomNav } from "../worker-bottom-nav";
import { ThemeProvider } from "@/lib/theme-provider";

export default function WorkerBottomNavExample() {
  return (
    <ThemeProvider>
      <div className="h-screen flex flex-col">
        <div className="flex-1 p-4">
          <p className="text-sm text-muted-foreground">Content area</p>
        </div>
        <WorkerBottomNav />
      </div>
    </ThemeProvider>
  );
}
