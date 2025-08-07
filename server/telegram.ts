import fetch from 'node-fetch';

export class TelegramService {
  private botToken: string;
  private baseUrl: string;

  constructor() {
    // Use the actual bot token directly since env variable isn't being loaded
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    console.log('🤖 Telegram Service initialized with token:', this.botToken ? 'Available' : 'Missing');
  }

  // Send job assignment notification
  async sendJobAssignment(params: {
    contractorName: string;
    phone: string;
    hbxlJob: string;
    buildPhases: string[];
    workLocation: string;
    startDate: string;
  }) {
    try {
      console.log('📱 Sending Telegram job assignment notification...');
      
      if (!this.botToken) {
        console.log('⚠️ No bot token - simulating notification');
        return { success: true, simulated: true };
      }

      // Use Rudy's actual Chat ID for job notifications
      const chatId = '7617462316';
      
      const message = this.formatJobAssignmentMessage(params);
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Telegram API error:', response.status, errorData);
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('✅ Telegram message sent successfully:', result);
      
      return { success: true, messageId: result.message_id };
      
    } catch (error) {
      console.error('❌ Telegram service error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send welcome message for contractor onboarding
  async sendWelcomeMessage(contractorName: string, phone: string) {
    try {
      console.log('📱 Sending welcome Telegram message...');
      
      if (!this.botToken) {
        console.log('⚠️ No bot token - simulating welcome message');
        return { success: true, simulated: true };
      }

      // Use Rudy's actual Chat ID for welcome messages
      const chatId = '7617462316';
      
      const message = `
🎉 <b>Welcome to JobFlow, ${contractorName}!</b>

Your contractor account has been set up successfully.

📱 Phone: ${phone}
🔧 You'll receive job assignments and updates through this bot.

To get started, make sure to:
✅ Keep notifications enabled
✅ Contact admin if you have any questions

Ready to receive your first job assignment!
      `.trim();
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Telegram welcome message error:', response.status, errorData);
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('✅ Telegram welcome message sent:', result);
      
      return { success: true, messageId: result.message_id };
      
    } catch (error) {
      console.error('❌ Welcome message error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private formatJobAssignmentMessage(params: {
    contractorName: string;
    phone: string;
    hbxlJob: string;
    buildPhases: string[];
    workLocation: string;
    startDate: string;
  }) {
    const { contractorName, phone, hbxlJob, buildPhases, workLocation, startDate } = params;
    
    const phasesText = Array.isArray(buildPhases) && buildPhases.length > 0
      ? buildPhases.map(phase => `• ${phase}`).join('\n')
      : '• No phases specified';
    
    return `🔨 JOB ASSIGNMENT - ${hbxlJob}

👤 Contractor: ${contractorName}
📱 Phone: ${phone}
📍 Location: ${workLocation}
📅 Start Date: ${startDate}

🏗️ Build Phases:
${phasesText}

Please confirm receipt and let us know if you have any questions!

Good luck with the project! 💪`;
  }

  // Send custom message to specific chat ID
  async sendCustomMessage(chatId: string, message: string) {
    try {
      console.log('📱 Sending custom Telegram message...');
      
      if (!this.botToken) {
        console.log('⚠️ No bot token - simulating message');
        return { success: true, simulated: true };
      }

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Telegram custom message error:', response.status, errorData);
        return { success: false, error: `Telegram API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('✅ Custom message sent successfully:', result);
      
      return { success: true, messageId: result.message_id };
      
    } catch (error) {
      console.error('❌ Custom message error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Get recent messages sent to the bot
  async getRecentMessages(limit: number = 10) {
    try {
      if (!this.botToken) {
        return { success: false, error: 'No bot token provided' };
      }

      console.log('📥 Checking for recent messages...');
      
      const response = await fetch(`${this.baseUrl}/getUpdates?limit=${limit}`);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Failed to get updates:', response.status, errorData);
        return { success: false, error: `Failed to get updates: ${response.status}` };
      }

      const result = await response.json();
      console.log('✅ Retrieved updates:', result);
      
      if (result.ok && result.result.length > 0) {
        const messages = result.result.map((update: any) => ({
          messageId: update.message?.message_id,
          from: update.message?.from,
          text: update.message?.text,
          date: new Date(update.message?.date * 1000),
          chatId: update.message?.chat?.id
        })).filter((msg: any) => msg.text);

        return { 
          success: true, 
          messages,
          totalUpdates: result.result.length
        };
      }
      
      return { 
        success: true, 
        messages: [],
        totalUpdates: 0
      };
      
    } catch (error) {
      console.error('❌ Error getting messages:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Test bot connection
  async testConnection() {
    try {
      if (!this.botToken) {
        return { success: false, error: 'No bot token provided' };
      }

      console.log('🧪 Testing Telegram bot connection...');
      
      const response = await fetch(`${this.baseUrl}/getMe`);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Bot connection test failed:', response.status, errorData);
        return { success: false, error: `Connection test failed: ${response.status}` };
      }

      const botInfo = await response.json();
      console.log('✅ Bot connection successful:', botInfo.result);
      
      return { 
        success: true, 
        botInfo: botInfo.result 
      };
      
    } catch (error) {
      console.error('❌ Bot connection error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}