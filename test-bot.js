// Simple test to verify bot token works
import fetch from 'node-fetch';

const botToken = '<REDACTED_TELEGRAM_BOT_TOKEN>';
const baseUrl = `https://api.telegram.org/bot${botToken}`;

async function testBot() {
  try {
    console.log('Testing bot connection...');
    
    const response = await fetch(`${baseUrl}/getMe`);
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Bot is working!');
      console.log('Bot name:', result.result.first_name);
      console.log('Bot username:', result.result.username);
      console.log('Bot ID:', result.result.id);
      
      console.log('\n📋 To receive messages:');
      console.log('1. Search for your bot in Telegram using: @' + result.result.username);
      console.log('2. Start a chat and send /start');
      console.log('3. Get your Chat ID from @userinfobot');
      
    } else {
      console.log('❌ Bot test failed:', result);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testBot();