import OpenAI from 'openai';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { createReadStream } from 'fs';
import { FileWriter } from 'wav';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Convert mulaw to linear PCM
 * Twilio sends mulaw-encoded audio, we need to convert it to PCM
 */
function mulawToPcm(mulaw: Buffer): Buffer {
  const MULAW_BIAS = 0x84;
  const MULAW_MAX = 0x1FFF;
  
  const pcm = Buffer.alloc(mulaw.length * 2); // 16-bit samples
  
  for (let i = 0; i < mulaw.length; i++) {
    let mulawByte = ~mulaw[i];
    let sign = mulawByte & 0x80;
    let exponent = (mulawByte >> 4) & 0x07;
    let mantissa = mulawByte & 0x0F;
    let sample = (mantissa << 3) + MULAW_BIAS;
    sample = sample << exponent;
    
    if (sign != 0) {
      sample = -sample;
    }
    
    // Write as 16-bit little-endian
    pcm.writeInt16LE(sample, i * 2);
  }
  
  return pcm;
}

/**
 * Create a proper WAV file from PCM audio
 */
async function createWavFile(pcmBuffer: Buffer, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const writer = new FileWriter(outputPath, {
      channels: 1,
      sampleRate: 8000, // Twilio sends 8kHz audio
      bitDepth: 16
    });
    
    writer.write(pcmBuffer);
    writer.end();
    
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });
}

/**
 * Transcribe audio buffer to text using OpenAI Whisper
 * Handles Twilio's mulaw format
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    // Convert mulaw to PCM
    const pcmBuffer = mulawToPcm(audioBuffer);
    
    // Create temporary WAV file
    const tempFile = join('/tmp', `audio_${Date.now()}.wav`);
    await createWavFile(pcmBuffer, tempFile);
    
    console.log(`🎤 Transcribing ${audioBuffer.length} bytes (${pcmBuffer.length} PCM)...`);
    
    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempFile) as any,
      model: 'whisper-1',
      language: 'en'
    });
    
    // Cleanup
    await unlink(tempFile).catch(() => {});
    
    const text = (transcription as any).text || '';
    
    if (text) {
      console.log(`✅ Transcription: "${text}"`);
    }
    
    return text.trim();
    
  } catch (error: any) {
    console.error('❌ Whisper transcription error:', error.message);
    return '';
  }
}
