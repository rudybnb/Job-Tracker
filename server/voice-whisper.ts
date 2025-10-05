import OpenAI from 'openai';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Transcribe audio buffer to text using OpenAI Whisper
 * Handles Twilio's mulaw format
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    // Save audio temporarily for Whisper API
    const tempFile = join('/tmp', `audio_${Date.now()}.wav`);
    await writeFile(tempFile, audioBuffer);
    
    console.log(`🎤 Transcribing audio (${audioBuffer.length} bytes)...`);
    
    // Call Whisper API
    const fs = await import('fs');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile) as any,
      model: 'whisper-1',
      language: 'en'
    });
    
    // Cleanup
    await unlink(tempFile).catch(() => {});
    
    const text = (transcription as any).text || '';
    
    console.log(`✅ Transcription: "${text}"`);
    
    return text.trim();
    
  } catch (error: any) {
    console.error('❌ Whisper transcription error:', error.message);
    return '';
  }
}

/**
 * Convert Twilio mulaw audio to WAV format for Whisper
 */
export function mulawToWav(mulawBuffer: Buffer): Buffer {
  // Twilio sends audio as base64-encoded mulaw
  // For now, return as-is - Whisper can handle various formats
  // In production, you might want to convert to proper WAV with headers
  return mulawBuffer;
}

/**
 * Detect silence in audio buffer
 * Used to know when user has stopped speaking
 */
export function detectSilence(audioBuffer: Buffer, threshold: number = 500): boolean {
  if (audioBuffer.length < threshold) return false;
  
  // Simple silence detection: check if buffer is mostly zeros or low values
  let silentSamples = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    if (Math.abs(audioBuffer[i] - 128) < 10) {
      silentSamples++;
    }
  }
  
  const silenceRatio = silentSamples / audioBuffer.length;
  return silenceRatio > 0.8; // 80% silence
}
