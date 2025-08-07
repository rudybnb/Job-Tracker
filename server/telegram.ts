// Use built-in fetch (Node.js 18+)
const fetch = globalThis.fetch;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA';
const TELEGRAM_BOT_ID = process.env.TELEGRAM_BOT_ID || '8382710567';

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
  async sendMessage({ chatId, message, parseMode = 'HTML' }: TelegramMessage): Promise<any> {
    try {
      console.log(`📱 Sending Telegram notification to chat ${chatId}`);
      console.log(`📝 Message:`, message.substring(0, 100) + '...');

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
        return result;
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
    const message = `🔨 <b>NEW JOB ASSIGNMENT</b>

📋 <b>Job:</b> ${jobName}
📍 <b>Location:</b> ${location}
📅 <b>Due Date:</b> ${dueDate}

<b>Build Phases:</b>
${phases.map(phase => `• ${phase}`).join('\n')}

Please confirm receipt and start GPS tracking when you begin work.`;

    const result = await this.sendMessage({
      chatId: contractorTelegramId,
      message: message,
      parseMode: 'HTML'
    });

    return !!result && result.ok;
  }

  /**
   * Send contractor onboarding notification
   */
  async sendOnboardingNotification(
    contractorTelegramId: string,
    contractorName: string,
    specialization: string
  ): Promise<boolean> {
    const message = `👋 <b>Welcome to JobFlow, ${contractorName}!</b>

🔧 <b>Specialization:</b> ${specialization}

Your account has been set up successfully. You'll receive job notifications through this chat.

📱 Please keep notifications enabled to receive real-time job assignments.
🎯 Start GPS tracking when you begin work on any assigned job.

Contact your admin if you have any questions.`;

    const result = await this.sendMessage({
      chatId: contractorTelegramId,
      message: message,
      parseMode: 'HTML'
    });

    return !!result && result.ok;
  }

  /**
   * Test connection to Telegram API
   */
  async testConnection(): Promise<{ success: boolean; botInfo?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`, {
        method: 'GET'
      });

      const result = await response.json();
      
      if (response.ok && result.ok) {
        return {
          success: true,
          botInfo: result.result
        };
      } else {
        return {
          success: false,
          error: result.description || 'Unknown error'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}