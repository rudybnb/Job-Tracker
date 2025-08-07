import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function TelegramTest() {
  const [chatId, setChatId] = useState("7617462316");
  const [message, setMessage] = useState("🔨 Test message from JobFlow system!");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const testTelegramBot = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/telegram/test');
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Bot Connection Success",
          description: `Bot: ${result.botInfo.first_name} (@${result.botInfo.username})`,
        });
      } else {
        toast({
          title: "Bot Connection Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to test bot connection",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestMessage = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`https://api.telegram.org/bot8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      const result = await response.json();
      console.log('Telegram API response:', result);
      
      if (result.ok) {
        toast({
          title: "Message Sent Successfully!",
          description: `Message delivered to chat ${chatId}`,
        });
      } else {
        toast({
          title: "Message Failed",
          description: `Error: ${result.description || 'Unknown error'}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Send message error:', error);
      toast({
        title: "Network Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Telegram Bot Test</h1>
          <p className="text-slate-400">Test the JobFlow Telegram notification system</p>
        </div>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Bot Connection Test</CardTitle>
            <CardDescription>Verify the bot is properly configured</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testTelegramBot} 
              disabled={isLoading}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              {isLoading ? "Testing..." : "Test Bot Connection"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Send Test Message</CardTitle>
            <CardDescription>Send a direct message to verify chat functionality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Chat ID</label>
              <Input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Enter Telegram Chat ID"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Message</label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter test message"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            
            <Button 
              onClick={sendTestMessage} 
              disabled={isLoading || !chatId || !message}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {isLoading ? "Sending..." : "Send Test Message"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-slate-300 space-y-3">
              <p><strong>Bot Token:</strong> 8382710567:AAFshEGUHA-3P-Jf_PuLIQjskb-1_fY6iEA</p>
              <p><strong>Bot ID:</strong> 8382710567</p>
              <p><strong>Your Chat ID:</strong> 7617462316</p>
              <p><strong>Your Phone:</strong> 07534251548</p>
              
              <div className="mt-4 p-3 bg-slate-700 rounded">
                <p className="text-yellow-400 font-medium mb-2">Important:</p>
                <p className="text-sm">To receive messages, you must first start a conversation with the bot by sending any message to it on Telegram.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}