import { DatabaseStorage } from "./database-storage";

const storage = new DatabaseStorage();

export class ProgressMonitor {
  
  // Calculate completion percentage for a job assignment
  async calculateJobProgress(assignmentId: string): Promise<number> {
    try {
      const assignment = await storage.getJobAssignment(assignmentId);
      if (!assignment) {
        console.log("⚠️ Assignment not found for progress calculation:", assignmentId);
        return 0;
      }

      // Get the job details to access phase task data
      const job = await storage.getJob(assignment.jobId);
      if (!job || !job.phaseTaskData) {
        console.log("⚠️ No task data found for job:", assignment.jobId);
        return 0;
      }

      let totalTasks = 0;
      let completedTasks = 0;

      // Parse phase task data to calculate progress
      const phaseData = JSON.parse(job.phaseTaskData);
      
      for (const [phaseName, tasks] of Object.entries(phaseData)) {
        if (Array.isArray(tasks)) {
          for (const task of tasks) {
            totalTasks++;
            // Check if task is completed (this would need to be tracked in assignment progress)
            // For now, we'll use a simple heuristic based on quantity completion
            if (task.completed === true || task.progress === 100) {
              completedTasks++;
            }
          }
        }
      }

      const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      console.log(`📊 Job progress calculated: ${completedTasks}/${totalTasks} tasks (${progressPercentage}%)`);
      
      return progressPercentage;
    } catch (error) {
      console.error("❌ Error calculating job progress:", error);
      return 0;
    }
  }

  // Check and trigger inspection notifications based on progress milestones
  async checkProgressMilestones(assignmentId: string): Promise<void> {
    try {
      const progress = await this.calculateJobProgress(assignmentId);
      const assignment = await storage.getJobAssignment(assignmentId);
      
      if (!assignment) return;

      // Check for 50% milestone
      if (progress >= 50) {
        await this.triggerInspectionIfNeeded(assignmentId, assignment.contractorName, "50_percent_ready");
      }

      // Check for 100% milestone  
      if (progress >= 100) {
        await this.triggerInspectionIfNeeded(assignmentId, assignment.contractorName, "100_percent_ready");
      }

    } catch (error) {
      console.error("❌ Error checking progress milestones:", error);
    }
  }

  // Trigger inspection notification if not already exists
  private async triggerInspectionIfNeeded(assignmentId: string, contractorName: string, notificationType: string): Promise<void> {
    try {
      // Check if notification already exists for this milestone
      const existingNotification = await storage.getInspectionNotificationByAssignmentAndType(assignmentId, notificationType);
      
      if (existingNotification) {
        console.log(`ℹ️ Inspection notification already exists for ${notificationType}:`, assignmentId);
        return;
      }

      // Create new inspection notification
      const notification = await storage.createInspectionNotification({
        assignmentId,
        contractorName,
        notificationType,
        notificationSent: true, // Immediately mark as sent since this is an automatic trigger
        inspectionCompleted: false
      });

      console.log(`🚨 ${notificationType.replace('_', ' ')} inspection triggered for ${contractorName}`);
      
      // TODO: Send actual notification (email, SMS, admin dashboard alert)
      // For now, this creates the database record that admin can see
      
    } catch (error) {
      console.error("❌ Error triggering inspection notification:", error);
    }
  }

  // Manually trigger progress check (called when task progress is updated)
  async updateTaskProgress(assignmentId: string, taskId: string, completed: boolean): Promise<void> {
    try {
      console.log(`📝 Task progress updated: ${taskId} = ${completed ? 'completed' : 'pending'}`);
      
      // After updating task progress, check if we've hit any milestones
      await this.checkProgressMilestones(assignmentId);
      
    } catch (error) {
      console.error("❌ Error updating task progress:", error);
    }
  }

  // Get all pending inspections for admin dashboard
  async getPendingInspections(): Promise<any[]> {
    try {
      const notifications = await storage.getPendingInspectionNotifications();
      
      const inspectionsWithDetails = await Promise.all(
        notifications.map(async (notification) => {
          const assignment = await storage.getJobAssignment(notification.assignmentId);
          const job = assignment ? await storage.getJob(assignment.jobId) : null;
          
          return {
            id: notification.id,
            assignmentId: notification.assignmentId,
            contractorName: notification.contractorName,
            notificationType: notification.notificationType,
            jobTitle: job?.title || 'Unknown Job',
            jobLocation: job?.location || 'Unknown Location',
            createdAt: notification.createdAt,
            inspectionType: notification.notificationType === '50_percent_ready' ? '50% Progress Inspection' : 'Final Completion Inspection'
          };
        })
      );

      return inspectionsWithDetails;
    } catch (error) {
      console.error("❌ Error getting pending inspections:", error);
      return [];
    }
  }
}

export const progressMonitor = new ProgressMonitor();