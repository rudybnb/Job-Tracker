import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function TelegramDebug() {
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const testTelegramNotification = async () => {
    setIsLoading(true);
    setResult("Testing...");
    
    try {
      const response = await fetch(`https://api.telegram.org/bot8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: '7617462316',
          text: `🔨 <b>FRONTEND TEST MESSAGE</b>

📋 <b>Job:</b> Test Assignment
📍 <b>Location:</b> Test Location
📅 <b>Start Date:</b> ${new Date().toLocaleDateString('en-GB')}
👤 <b>Contractor:</b> James

<b>Build Phases:</b>
• Test Phase 1
• Test Phase 2

This message was sent directly from the frontend to test the notification system.`,
          parse_mode: 'HTML'
        })
      });
      
      const data = await response.json();
      console.log('Telegram API response:', data);
      
      if (data.ok) {
        setResult(`✅ SUCCESS: Message sent! Message ID: ${data.result.message_id}`);
      } else {
        setResult(`❌ FAILED: ${data.description || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Telegram test error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResult(`❌ ERROR: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-yellow-400 mb-6">Telegram Debug Test</h1>
        
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Telegram Notification</h2>
          <p className="text-slate-400 mb-4">
            This will send a test message directly from the frontend to verify the Telegram integration.
          </p>
          
          <Button 
            onClick={testTelegramNotification}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 mb-4"
          >
            {isLoading ? 'Sending...' : 'Send Test Message'}
          </Button>
          
          {result && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Result:</h3>
              <pre className="text-sm text-slate-300">{result}</pre>
            </div>
          )}
        </div>
        
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Bot Information</h2>
          <div className="space-y-2 text-sm">
            <p><strong>Bot:</strong> @ERbuildanddesign_bot</p>
            <p><strong>Token:</strong> 8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA</p>
            <p><strong>Chat ID:</strong> 7617462316</p>
            <p><strong>Phone:</strong> 07534251548</p>
          </div>
        </div>
      </div>
    </div>
  );
}