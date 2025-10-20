import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, MessageSquare, Clock, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Query, QueryMessage, User } from "@shared/schema";

const createQuerySchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  category: z.enum(["pay", "hr", "scheduling", "other"]),
  priority: z.enum(["low", "medium", "high"]),
  description: z.string().min(1, "Description is required"),
});

type CreateQueryData = z.infer<typeof createQuerySchema>;

type QueryWithUser = Query & { user: User };
type QueryWithMessages = Query & { user: User; messages: (QueryMessage & { user: User })[] };

const categoryColors = {
  pay: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  hr: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  scheduling: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  other: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const statusColors = {
  open: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  closed: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const priorityColors = {
  low: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  high: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

const statusIcons = {
  open: Clock,
  in_progress: AlertCircle,
  closed: CheckCircle,
};

export default function Queries() {
  const [selectedQuery, setSelectedQuery] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: queries = [], isLoading } = useQuery<QueryWithUser[]>({
    queryKey: ["/api/queries", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const response = await fetch(`/api/queries?${params}`);
      if (!response.ok) throw new Error("Failed to fetch queries");
      return response.json();
    },
  });

  const createForm = useForm<CreateQueryData>({
    resolver: zodResolver(createQuerySchema),
    defaultValues: {
      subject: "",
      category: "pay",
      priority: "medium",
      description: "",
    },
  });

  const createQueryMutation = useMutation({
    mutationFn: async (data: CreateQueryData) => {
      return await apiRequest("POST", "/api/queries", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queries"] });
      setCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Query created",
        description: "Your query has been submitted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create query. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onCreateSubmit = (data: CreateQueryData) => {
    createQueryMutation.mutate(data);
  };

  const getStatusIcon = (status: string) => {
    const Icon = statusIcons[status as keyof typeof statusIcons] || Clock;
    return <Icon className="h-3 w-3" />;
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.email?.[0]?.toUpperCase() || "U";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Staff Queries</h1>
          <p className="text-muted-foreground mt-1">
            Pay, HR, and scheduling support tickets
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-query">
              <Plus className="h-4 w-4 mr-2" />
              New Query
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-create-query">
            <DialogHeader>
              <DialogTitle>Create New Query</DialogTitle>
              <DialogDescription>
                Submit a question about pay, HR, or scheduling
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Brief description of your query"
                          data-testid="input-subject"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pay">Pay</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="scheduling">Scheduling</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide details about your query..."
                          className="min-h-32"
                          data-testid="textarea-description"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createQueryMutation.isPending}
                    data-testid="button-submit-query"
                  >
                    {createQueryMutation.isPending ? "Creating..." : "Create Query"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open">
            Open
          </TabsTrigger>
          <TabsTrigger value="in_progress" data-testid="tab-in-progress">
            In Progress
          </TabsTrigger>
          <TabsTrigger value="closed" data-testid="tab-closed">
            Closed
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-muted rounded w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : queries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No queries found for this status
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {queries.map((query) => (
                <Card
                  key={query.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedQuery(query.id)}
                  data-testid={`card-query-${query.id}`}
                >
                  <CardHeader className="space-y-0 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base line-clamp-1">
                          {query.subject}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {query.user.firstName} {query.user.lastName} •{" "}
                          {formatDistanceToNow(new Date(query.createdAt), { addSuffix: true })}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className={priorityColors[query.priority as keyof typeof priorityColors]}
                        data-testid={`badge-priority-${query.id}`}
                      >
                        {query.priority}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {query.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={categoryColors[query.category as keyof typeof categoryColors]}
                        data-testid={`badge-category-${query.id}`}
                      >
                        {query.category}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusColors[query.status as keyof typeof statusColors]}
                        data-testid={`badge-status-${query.id}`}
                      >
                        {getStatusIcon(query.status)}
                        <span className="ml-1">{query.status.replace("_", " ")}</span>
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Tabs>

      {selectedQuery && (
        <QueryDetailDialog
          queryId={selectedQuery}
          onClose={() => setSelectedQuery(null)}
          userRole={user?.role || "worker"}
        />
      )}
    </div>
  );
}

function QueryDetailDialog({
  queryId,
  onClose,
  userRole,
}: {
  queryId: number;
  onClose: () => void;
  userRole: string;
}) {
  const [replyMessage, setReplyMessage] = useState("");
  const { toast } = useToast();

  const { data: query, isLoading } = useQuery<QueryWithMessages>({
    queryKey: ["/api/queries", queryId],
    queryFn: async () => {
      const response = await fetch(`/api/queries/${queryId}`);
      if (!response.ok) throw new Error("Failed to fetch query");
      return response.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return await apiRequest("PATCH", `/api/queries/${queryId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queries"] });
      toast({
        title: "Status updated",
        description: "Query status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async (priority: string) => {
      return await apiRequest("PATCH", `/api/queries/${queryId}/priority`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queries"] });
      toast({
        title: "Priority updated",
        description: "Query priority has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update priority. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest("POST", `/api/queries/${queryId}/messages`, { message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queries", queryId] });
      setReplyMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been added to the query.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendReply = () => {
    if (replyMessage.trim()) {
      addMessageMutation.mutate(replyMessage.trim());
    }
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.email?.[0]?.toUpperCase() || "U";
  };

  const canManageQuery = userRole === "admin" || userRole === "site_manager";

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="dialog-query-detail">
        {isLoading ? (
          <div className="space-y-4 p-6">
            <div className="h-6 bg-muted rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          </div>
        ) : query ? (
          <div className="flex flex-col h-full">
            <DialogHeader>
              <DialogTitle className="text-xl">{query.subject}</DialogTitle>
              <DialogDescription>
                Created by {query.user.firstName} {query.user.lastName} •{" "}
                {formatDistanceToNow(new Date(query.createdAt), { addSuffix: true })}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 my-4 flex-wrap">
              <Badge
                variant="outline"
                className={categoryColors[query.category as keyof typeof categoryColors]}
              >
                {query.category}
              </Badge>
              <Badge
                variant="outline"
                className={statusColors[query.status as keyof typeof statusColors]}
              >
                {query.status.replace("_", " ")}
              </Badge>
              <Badge
                variant="outline"
                className={priorityColors[query.priority as keyof typeof priorityColors]}
              >
                {query.priority}
              </Badge>
              {canManageQuery && (
                <>
                  <Select
                    value={query.status}
                    onValueChange={updateStatusMutation.mutate}
                    disabled={updateStatusMutation.isPending}
                  >
                    <SelectTrigger className="w-auto" data-testid="select-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={query.priority}
                    onValueChange={updatePriorityMutation.mutate}
                    disabled={updatePriorityMutation.isPending}
                  >
                    <SelectTrigger className="w-auto" data-testid="select-priority-update">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Priority</SelectItem>
                      <SelectItem value="medium">Medium Priority</SelectItem>
                      <SelectItem value="high">High Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <Card className="mb-4">
              <CardContent className="pt-4">
                <p className="text-sm">{query.description}</p>
              </CardContent>
            </Card>

            <Separator className="my-2" />

            <div className="flex-1 min-h-0">
              <h3 className="font-medium mb-3">Conversation</h3>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-4">
                  {query.messages.map((message) => (
                    <div key={message.id} className="flex gap-3" data-testid={`message-${message.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.user.profileImageUrl || undefined} />
                        <AvatarFallback>{getInitials(message.user)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-sm">
                            {message.user.firstName} {message.user.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{message.message}</p>
                      </div>
                    </div>
                  ))}
                  {query.messages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No messages yet. Start the conversation below.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Type your reply..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="min-h-20"
                data-testid="textarea-reply"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSendReply}
                  disabled={!replyMessage.trim() || addMessageMutation.isPending}
                  data-testid="button-send-reply"
                >
                  {addMessageMutation.isPending ? "Sending..." : "Send Reply"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
