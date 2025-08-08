// Simple test script to send contractor hello message via direct API call
const fetch = require('node-fetch');

async function sendTelegramHello() {
  console.log('🧪 Testing Telegram contractor hello message...');
  
  try {
    // Direct Telegram API call
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA';
    const chatId = '7617462316'; // Rudy's chat ID
    
    const message = `👋 Hello from James Carpenter!

🔧 I'm ready to start work today
📍 Currently at job site
⏰ Timer system is working perfectly
📱 All systems are ready for GPS tracking

Looking forward to today's assignments! 💪`;
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
      return;
    }

    const result = await response.json();
    console.log('✅ SUCCESS: Hello message sent from James Carpenter');
    console.log('📨 Message ID:', result.message_id);
    console.log('📱 Full response:', result);
    
  } catch (error) {
    console.error('💥 ERROR:', error.message);
  }
}

sendTelegramHello();