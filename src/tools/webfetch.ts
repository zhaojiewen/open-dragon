import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const WebFetchParamsSchema = z.object({
  url: z.string().describe('The URL to fetch'),
  prompt: z.string().optional().describe('What to extract from the page'),
});

// Blocked IP ranges to prevent SSRF
const BLOCKED_IP_PATTERNS = [
  /^127\./,                        // Loopback
  /^10\./,                         // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./,   // Private Class B
  /^192\.168\./,                   // Private Class C
  /^169\.254\./,                   // Link-local / cloud metadata
  /^0\./,                          // "This" network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier NAT
  /^fc00:/i,                       // IPv6 Unique Local
  /^fe80:/i,                       // IPv6 Link-local
  /^::1$/i,                        // IPv6 Loopback
];

const BLOCKED_HOSTS = [
  'metadata.google.internal',
  '169.254.169.254',  // AWS/Azure/GCP metadata
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '[::1]',
];

export class WebFetchTool extends BaseTool {
  readonly name = 'webfetch';
  readonly description = 'Fetch content from a URL. Use for retrieving web pages, APIs, and other online resources.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      prompt: { type: 'string', description: 'What to extract from the page' },
    },
    required: ['url'],
  };

  async execute(params: Record<string, unknown>, context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, WebFetchParamsSchema);

    const { url, prompt } = params as z.infer<typeof WebFetchParamsSchema>;

    const allowLocalhost = context?.permissions?.includes('webfetch:allow-localhost');

    // Validate URL and prevent SSRF
    const urlError = this.validateUrl(url, allowLocalhost);
    if (urlError) {
      return { success: false, output: urlError, error: 'URL blocked' };
    }

    try {
      const content = await this.fetchUrl(url, allowLocalhost);

      const maxLength = 10000;
      let output = content;
      if (content.length > maxLength) {
        output = content.substring(0, maxLength) + '\n... (content truncated)';
      }

      return { success: true, output };
    } catch (error: any) {
      return {
        success: false,
        output: `Error fetching URL: ${error.message}`,
        error: error.message,
      };
    }
  }

  private validateUrl(urlStr: string, allowLocalhost: boolean = false): string | null {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return 'Invalid URL format';
    }

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `Protocol ${parsed.protocol} is not allowed. Only http and https are supported.`;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check blocked hostnames (skip localhost if allowed)
    if (!allowLocalhost || hostname !== 'localhost') {
      if (BLOCKED_HOSTS.includes(hostname)) {
        return `Access to ${hostname} is blocked for security.`;
      }
    }

    // Resolve and check if it's a blocked IP range
    if (this.isBlockedIp(hostname)) {
      return `Access to IP ${hostname} is blocked (private/internal range).`;
    }

    return null;
  }

  private isBlockedIp(hostname: string): boolean {
    // Check if hostname is an IP address
    const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    const isIpv6 = /^[a-f0-9:]+$/i.test(hostname) && hostname.includes(':');

    if (isIpv4 || isIpv6) {
      return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(hostname));
    }

    return false;
  }

  private fetchUrl(url: string, allowLocalhost: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;

      const request = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DragonCLI/1.0)',
        },
      }, (response) => {
        // Check for redirect to internal host
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            const err = this.validateUrl(redirectUrl, allowLocalhost);
            if (err) {
              reject(new Error(`Blocked redirect: ${err}`));
              return;
            }
            this.fetchUrl(redirectUrl, allowLocalhost).then(resolve).catch(reject);
            return;
          }
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
          if (data.length > 1024 * 1024) { // 1MB limit
            request.destroy();
            reject(new Error('Response too large (>1MB)'));
          }
        });
        response.on('end', () => resolve(data));
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}
