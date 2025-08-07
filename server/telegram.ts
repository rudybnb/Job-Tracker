// Use built-in fetch (Node.js 18+)
const fetch = globalThis.fetch;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOT_ID = process.env.TELEGRAM_BOT_ID;

export interface TelegramMessage {
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'Markdown';
}

export class TelegramService {
  private baseUrl: string;

  constructor() {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }
    this.baseUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  }

  /**
   * Send a message to a Telegram chat
   */
  async sendMessage({ chatId, message, parseMode = 'HTML' }: TelegramMessage): Promise<boolean> {
    try {
      console.log(`📱 Sending Telegram notification to chat ${chatId}`);
      console.log(`📝 Message: ${message}`);

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.ok) {
        console.log('✅ Telegram notification sent successfully');
        return true;
      } else {
        console.error('❌ Telegram API error:', result);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send Telegram notification:', error);
      return false;
    }
  }

  /**
   * Send job assignment notification to contractor
   */
  async sendJobAssignmentNotification(
    contractorTelegramId: string,
    jobName: string,
    phases: string[],
    dueDate: string,
    location: string
  ): Promise<boolean> {
    const message = `
🔨 <b>NEW JOB ASSIGNMENT</b>

📋 <b>Job:</b> ${jobName}
📍 <b>Location:</b> ${location}
📅 <b>Due Date:</b> ${dueDate}

<b>Build Phases:</b>
${phases.map(phase => `• ${phase}`).join('\n')}

Please confirm receipt and start GPS tracking when you begin work.
    `.trim();

    return this.sendMessage({
      chatId: contractorTelegramId,
      message,
      parseMode: 'HTML'
    });
  }

  /**
   * Send contractor onboarding notification
   */
  async sendOnboardingNotification(
    contractorTelegramId: string,
    contractorName: string,
    specialization: string
  ): Promise<boolean> {
    const message = `
👋 <b>WELCOME TO JOBFLOW!</b>

<b>Contractor:</b> ${contractorName}
<b>Specialization:</b> ${specialization}

You've been successfully added to our system. You'll receive job assignments here and can track your progress through our GPS-enabled dashboard.

🚀 Ready to get started!
    `.trim();

    return this.sendMessage({
      chatId: contractorTelegramId,
      message,
      parseMode: 'HTML'
    });
  }

  /**
   * Send task completion notification to admin
   */
  async sendTaskCompletionNotification(
    adminTelegramId: string,
    contractorName: string,
    taskName: string,
    jobName: string
  ): Promise<boolean> {
    const message = `
✅ <b>TASK COMPLETED</b>

<b>Contractor:</b> ${contractorName}
<b>Task:</b> ${taskName}
<b>Job:</b> ${jobName}
<b>Time:</b> ${new Date().toLocaleString('en-GB')}

Check the admin dashboard for progress updates.
    `.trim();

    return this.sendMessage({
      chatId: adminTelegramId,
      message,
      parseMode: 'HTML'
    });
  }

  /**
   * Test the bot connection
   */
  async testConnection(): Promise<{ success: boolean; botInfo?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const result = await response.json();
      
      if (response.ok && result.ok) {
        return { success: true, botInfo: result.result };
      } else {
        return { success: false, error: result.description || 'Unknown error' };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}