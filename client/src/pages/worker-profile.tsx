import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { WorkerBottomNav } from "@/components/worker-bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { User as UserIcon, Mail, MapPin, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { User, Site } from "@shared/schema";

export default function WorkerProfile() {
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ['/api/sites'],
  });

  const userSite = sites.find(s => s.id === user?.siteId);

  if (userLoading) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <WorkerBottomNav />
      </div>
    );
  }

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.[0] || '';
    const last = lastName?.[0] || '';
    return (first + last).toUpperCase() || 'W';
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0 bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-profile-title">My Profile</h1>
          <p className="text-muted-foreground mt-1">View your personal information</p>
        </div>

        {/* Profile Card */}
        <Card data-testid="card-profile">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(user?.firstName, user?.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold" data-testid="text-user-name">
                  {user?.firstName} {user?.lastName}
                </h2>
                <Badge variant="outline" className="mt-2 capitalize">
                  {user?.role}
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              {user?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium" data-testid="text-user-email">{user.email}</p>
                  </div>
                </div>
              )}

              {userSite && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Site</p>
                    <p className="font-medium" data-testid="text-user-site">
                      {userSite.name} - {userSite.location}
                    </p>
                  </div>
                </div>
              )}

              {user?.hourlyRate && (
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Hourly Rate</p>
                    <p className="font-medium font-mono" data-testid="text-user-rate">
                      £{Number(user.hourlyRate).toFixed(2)}/hour
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium" data-testid="text-user-joined">
                    {format(new Date(user?.createdAt || new Date()), 'MMMM yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card data-testid="card-account-status">
          <CardHeader>
            <CardTitle className="text-base">Account Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Account Active</span>
              <Badge 
                variant="outline" 
                className={
                  user?.isActive 
                    ? "bg-chart-5/10 text-chart-5 border-chart-5/20" 
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }
              >
                {user?.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
      <WorkerBottomNav />
    </div>
  );
}
