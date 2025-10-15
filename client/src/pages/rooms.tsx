import { QRScanner } from "@/components/qr-scanner";
import { RoomScanLog } from "@/components/room-scan-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoomSchema, type Room, type Site, type RoomScan, type User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

export default function Rooms() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: rooms, isLoading: roomsLoading } = useQuery<(Room & { site: Site })[]>({
    queryKey: ['/api/rooms'],
  });

  const { data: scans, isLoading: scansLoading } = useQuery<(RoomScan & { room: Room & { site: Site }, user: User })[]>({
    queryKey: ['/api/room-scans'],
  });

  const { data: sites } = useQuery<Site[]>({
    queryKey: ['/api/sites'],
  });

  const refreshQRMutation = useMutation({
    mutationFn: async (roomId: number) => {
      return await apiRequest<Room>('POST', `/api/rooms/${roomId}/refresh-qr`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rooms'] });
      toast({
        title: "QR Code Refreshed",
        description: "A new QR code has been generated for this room.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh QR code",
        variant: "destructive",
      });
    },
  });

  const roomFormSchema = insertRoomSchema.omit({ qrCode: true, qrCodeExpiry: true });
  
  const createRoomForm = useForm({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      name: "",
      siteId: undefined,
      isActive: true,
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest<Room>('POST', '/api/rooms', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rooms'] });
      setCreateDialogOpen(false);
      createRoomForm.reset();
      toast({
        title: "Room Created",
        description: "The room has been created with a new QR code.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create room",
        variant: "destructive",
      });
    },
  });

  const handleCreateRoom = (data: any) => {
    createRoomMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Room Scans</h1>
          <p className="text-muted-foreground mt-1">
            QR code scanning for room entry monitoring
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-room">
              <Plus className="h-4 w-4 mr-2" />
              Add Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Room</DialogTitle>
              <DialogDescription>
                Add a new room with automatic QR code generation
              </DialogDescription>
            </DialogHeader>
            <Form {...createRoomForm}>
              <form onSubmit={createRoomForm.handleSubmit(handleCreateRoom)} className="space-y-4">
                <FormField
                  control={createRoomForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Room Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Room 101 - Patient Ward" {...field} data-testid="input-room-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createRoomForm.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger data-testid="select-site">
                            <SelectValue placeholder="Select a site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sites?.map((site) => (
                            <SelectItem key={site.id} value={site.id.toString()}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRoomMutation.isPending} data-testid="button-submit-room">
                    {createRoomMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Room
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="qr-codes" className="w-full">
        <TabsList>
          <TabsTrigger value="qr-codes" data-testid="tab-qr-codes">
            QR Codes
          </TabsTrigger>
          <TabsTrigger value="scan-log" data-testid="tab-scan-log">
            Scan Log ({scans?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qr-codes" className="mt-6">
          {roomsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : rooms && rooms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rooms.map((room) => (
                <QRScanner
                  key={room.id}
                  roomId={room.id}
                  roomName={room.name}
                  qrCode={room.qrCode}
                  qrCodeExpiry={new Date(room.qrCodeExpiry).toISOString()}
                  onRefresh={() => refreshQRMutation.mutate(room.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <p className="text-sm text-muted-foreground text-center">
                  No rooms found. Create a room to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scan-log" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Scans</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {scansLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : scans && scans.length > 0 ? (
                scans.map((scan) => (
                  <RoomScanLog
                    key={scan.id}
                    id={scan.id.toString()}
                    roomName={scan.room.name}
                    staffName={`${scan.user.firstName || ''} ${scan.user.lastName || ''}`.trim() || scan.user.email || 'Unknown'}
                    timestamp={format(new Date(scan.scannedAt), 'HH:mm')}
                    confidence={scan.confidence}
                    deviceId={scan.deviceId}
                    status={scan.status as "verified" | "low-confidence" | "failed"}
                  />
                ))
              ) : (
                <div className="p-8">
                  <p className="text-sm text-muted-foreground text-center">
                    No scans recorded yet
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Room Rounds Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                Compliance tracking coming soon
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
