import { AppSidebar } from "../app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/lib/theme-provider";

export default function AppSidebarExample() {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex-1 p-4">
            <p className="text-sm text-muted-foreground">Main content area</p>
          </div>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
