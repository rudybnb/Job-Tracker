import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { JobWithContractor } from "@shared/schema";

// Mounted inside the existing admin-only Jobs page. The API also checks the session.
export default function JobStatusOverview() {
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: jobs = [], isLoading, isError, refetch } = useQuery<JobWithContractor[]>({
    queryKey: ["/api/jobs"],
  });
  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "assigned" | "completed" }) => {
      const response = await apiRequest("PATCH", `/api/jobs/${encodeURIComponent(id)}/status`, { status });
      return response.json() as Promise<{ id: string; status: JobWithContractor["status"] }>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<JobWithContractor[]>(["/api/jobs"], (current) =>
        current?.map((job) => job.id === updated.id ? { ...job, status: updated.status } : job));
      toast({ title: updated.status === "assigned" ? "Job Activated" : "Job Completed" });
    },
    onError: (error) => toast({ title: "Status Not Updated", description: error.message, variant: "destructive" }),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${variables.id}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] }),
      ]);
    },
  });

  return (
    <section className="ja-panel" aria-labelledby="job-overview-title">
      <div className="ja-panel__head"><h2 id="job-overview-title">Job Overview</h2></div>
      <Tabs value={filter} onValueChange={setFilter} className="ja-panel__body space-y-3">
        <TabsList aria-label="Job status">
          <TabsTrigger value="all">All Jobs</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="assigned">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="space-y-3">
        {isLoading && <p role="status">Loading jobs…</p>}
        {isError && <div role="alert">Unable to load jobs. <Button onClick={() => refetch()}>Retry</Button></div>}
        {!isLoading && !isError && !jobs.some((job) => filter === "all" || job.status === filter) && <p>No jobs found.</p>}
        {jobs.filter((job) => filter === "all" || job.status === filter).map((job) => (
          <article key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-600 p-4">
            <div>
              <h3 className="font-semibold">{job.title}</h3>
              <p>{job.location}</p>
              <p aria-live="polite">Status: <strong>{job.status === "assigned" ? "Active" : job.status === "completed" ? "Completed" : "Pending"}</strong></p>
            </div>
            {job.status === "pending" && <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ id: job.id, status: "assigned" })}>Activate Job</Button>}
            {job.status === "assigned" && <Button variant="outline" disabled={mutation.isPending} onClick={() => {
              if (window.confirm(`Complete "${job.title}"? Completed jobs cannot be reactivated here.`)) {
                mutation.mutate({ id: job.id, status: "completed" });
              }
            }}>Complete Job</Button>}
          </article>
        ))}
        </TabsContent>
      </Tabs>
    </section>
  );
}
