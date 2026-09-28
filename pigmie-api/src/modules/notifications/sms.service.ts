import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private getProviderConfig() {
    return {
      provider: process.env.SMS_PROVIDER || 'console', // msg91, twilio, textlocal, console
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID || 'PIGMIE',
      twilioSid: process.env.TWILIO_SID, // specifically for Twilio
      twilioNumber: process.env.TWILIO_NUMBER,
    };
  }

  async sendSMS(phone: string, message: string): Promise<boolean> {
    const config = this.getProviderConfig();

    if (!config.provider || config.provider === 'console') {
      this.logger.log(`[SMS to ${phone}] (MOCK): ${message}`);
      return true;
    }

    try {
      if (config.provider === 'msg91') {
        return await this.sendViaMsg91(phone, message, config);
      } else if (config.provider === 'twilio') {
        return await this.sendViaTwilio(phone, message, config);
      } else {
        this.logger.warn(`Unsupported SMS provider: ${config.provider}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}: ${error}`);
      return false;
    }
  }

  async sendBulkSMS(recipients: { phone: string; message: string }[]): Promise<void> {
    // Basic implementation, iterating and sending.
    // Provider specific bulk endpoints can be optimized later.
    for (const recipient of recipients) {
      await this.sendSMS(recipient.phone, recipient.message);
    }
  }

  private async sendViaMsg91(phone: string, message: string, config: any): Promise<boolean> {
    if (!config.apiKey) throw new Error('MSG91 API key is missing');
    
    // Basic MSG91 Implementation
    const url = 'https://api.msg91.com/api/v5/sendsms';
    const payload = {
      sender: config.senderId,
      route: '4', // transactional
      country: '91',
      sms: [{ message, to: [phone] }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authkey': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`MSG91 returned ${response.status} ${response.statusText}`);
    }
    
    return true;
  }

  private async sendViaTwilio(phone: string, message: string, config: any): Promise<boolean> {
    if (!config.twilioSid || !config.apiKey) throw new Error('Twilio credentials missing');
    
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioSid}/Messages.json`;
    
    const body = new URLSearchParams({
      To: phone,
      From: config.twilioNumber || config.senderId,
      Body: message
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.twilioSid}:${config.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`Twilio returned ${response.status} ${response.statusText}`);
    }

    return true;
  }
}
