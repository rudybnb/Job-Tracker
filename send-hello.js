// Send a test "hello" message
const fetch = require('node-fetch');

const botToken = '<REDACTED_TELEGRAM_BOT_TOKEN>';
const baseUrl = `https://api.telegram.org/bot${botToken}`;

async function sendHello(chatId) {
  try {
    const message = '👋 Hello from ERdesignandbuild! This is a test message to confirm the Telegram integration is working.';
    
    const response = await fetch(`${baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Hello message sent successfully!');
    } else {
      console.log('❌ Failed to send message:', result);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// You need to replace this with your actual Chat ID
// Get it by messaging @userinfobot in Telegram
const yourChatId = 'YOUR_CHAT_ID_HERE';

if (yourChatId === 'YOUR_CHAT_ID_HERE') {
  console.log('Please update yourChatId with your real Chat ID');
  console.log('Get it by messaging @userinfobot in Telegram');
} else {
  sendHello(yourChatId);
}