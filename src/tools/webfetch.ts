import * as https from 'https';
import * as http from 'http';
import { BaseTool, ToolExecuteResult, ToolContext } from './base.js';
import { z } from 'zod';

const WebFetchParamsSchema = z.object({
  url: z.string().describe('The URL to fetch'),
  prompt: z.string().optional().describe('What to extract from the page'),
});

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

    try {
      const content = await this.fetchUrl(url);

      // Truncate if too long
      const maxLength = 10000;
      let output = content;
      if (content.length > maxLength) {
        output = content.substring(0, maxLength) + '\n... (content truncated)';
      }

      return {
        success: true,
        output,
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Error fetching URL: ${error.message}`,
        error: error.message,
      };
    }
  }

  private fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;

      const request = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DragonCLI/1.0)',
        },
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetchUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}
