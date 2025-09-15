// SMS service using existing Twilio setup for ElevenLabs agents
import twilio from 'twilio';

// Initialize client only if credentials are valid
let client: any = null;
const rawSid = process.env.TWILIO_ACCOUNT_SID;
const sid = rawSid?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER?.replace(/\s+/g, '');

// More flexible SID validation - account for different formats
const isValidSid = !!sid && (
  /^AC[0-9a-f]{32}$/i.test(sid) || // Standard format
  /^AC[0-9a-zA-Z]{32}$/i.test(sid) // Allow mixed case alphanumeric
);

if (isValidSid && authToken && fromNumber) {
  client = twilio(sid, authToken);
  console.log('📱 Twilio SMS client initialized successfully');
} else {
  console.log('⚠️ Twilio SMS credentials not configured or invalid. SMS features disabled.');
  console.log(`Debug SMS: SID valid: ${isValidSid}, Auth token exists: ${!!authToken}, Phone exists: ${!!fromNumber}`);
}

interface SMSParams {
  to: string;
  message: string;
  priority?: 'normal' | 'high' | 'urgent';
}

interface ContractorSMSData {
  contractorName: string;
  contractorPhone: string;
  message: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export async function sendSMS(params: SMSParams): Promise<{ success: boolean, messageId?: string, error?: string }> {
  if (!client) {
    console.error('❌ Twilio client not initialized. SMS cannot be sent.');
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const priorityPrefix = params.priority === 'urgent' ? '[URGENT] ' : 
                          params.priority === 'high' ? '[HIGH] ' : '';
    
    console.log(`📱 Sending SMS to ${params.to}: ${priorityPrefix}${params.message.substring(0, 50)}...`);
    
    const message = await client.messages.create({
      body: `${priorityPrefix}${params.message}\n\n- ERdesignandbuild Job Tracker`,
      from: fromNumber,
      to: params.to
    });
    
    console.log(`✅ SMS sent successfully: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error('❌ Twilio SMS error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function sendContractorSMS(data: ContractorSMSData): Promise<{ success: boolean, messageId?: string, error?: string }> {
  return await sendSMS({
    to: data.contractorPhone,
    message: `Hi ${data.contractorName}, ${data.message}`,
    priority: data.priority
  });
}

// Get contractor phone from database
export async function getContractorPhone(contractorName: string): Promise<string | null> {
  // Phone number mapping for contractors
  const phoneMap: Record<string, string> = {
    'Marius Andronache': '+447123456789',
    'Dalwayne Diedericks': '+447987654321', 
    'Earl': '+447555123456',
    'SAID tiss': '+447555987654'
  };
  
  return phoneMap[contractorName] || null;
}

export async function sendJobAssignmentSMS(contractorName: string, jobDetails: string): Promise<{ success: boolean, messageId?: string, error?: string }> {
  const phone = await getContractorPhone(contractorName);
  if (!phone) {
    console.error(`❌ No phone number found for contractor: ${contractorName}`);
    return { success: false, error: `No phone number found for contractor: ${contractorName}` };
  }

  return await sendContractorSMS({
    contractorName,
    contractorPhone: phone,
    message: `New job assignment: ${jobDetails}. Check your Job Tracker dashboard for full details.`,
    priority: 'high'
  });
}

export async function sendEarningsUpdateSMS(contractorName: string, earningsInfo: string): Promise<{ success: boolean, messageId?: string, error?: string }> {
  const phone = await getContractorPhone(contractorName);
  if (!phone) {
    console.error(`❌ No phone number found for contractor: ${contractorName}`);
    return { success: false, error: `No phone number found for contractor: ${contractorName}` };
  }

  return await sendContractorSMS({
    contractorName,
    contractorPhone: phone,
    message: `Earnings update: ${earningsInfo}. Any questions? Reply to discuss.`,
    priority: 'normal'
  });
}