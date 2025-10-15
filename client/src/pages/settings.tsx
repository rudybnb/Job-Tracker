import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Bell, Shield, Palette, Database } from "lucide-react";

export default function Settings() {
  const settingsSections = [
    {
      title: "General",
      description: "Manage general application settings",
      icon: SettingsIcon,
    },
    {
      title: "Notifications",
      description: "Configure notification preferences",
      icon: Bell,
    },
    {
      title: "Security",
      description: "Security and authentication settings",
      icon: Shield,
    },
    {
      title: "Appearance",
      description: "Customize the application appearance",
      icon: Palette,
    },
    {
      title: "Data & Backup",
      description: "Data management and backup options",
      icon: Database,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your application preferences and settings
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsSections.map((section) => (
          <Card
            key={section.title}
            className="hover-elevate cursor-pointer"
            data-testid={`card-${section.title.toLowerCase().replace(/\s/g, '-')}`}
          >
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <section.icon className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base font-medium">
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-12">
        <div className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <SettingsIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium">Settings Coming Soon</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Advanced configuration options will be available in a future update
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
