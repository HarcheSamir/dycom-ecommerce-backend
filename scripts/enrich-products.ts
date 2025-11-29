// scripts/enrich-products.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

const BATCH_SIZE = 50;
const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'; // override with env if needed
const API_KEY = process.env.GEMINI_API_KEY ?? '';

if (!API_KEY) {
  console.error('ERROR: GEMINI_API_KEY environment variable is not set.');
  console.error('Export it with: export GEMINI_API_KEY="ya29.your_key_here"');
  process.exit(1);
}

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Google GenAI client with required options
const genAI = new GoogleGenAI({
  apiKey: API_KEY,
});

/**
 * Try to extract textual content from different possible SDK result shapes.
 * Different SDK versions expose responses slightly differently (text, response.text(), etc.).
 */
function extractTextFromResult(result: any): string {
  try {
    // 1) If the result is already a string
    if (typeof result === 'string') return result;

    // 2) Common quickstart: result.text (string)
    if (typeof result.text === 'string') return result.text;

    // 3) result.response may be an object with text() method
    if (result?.response) {
      const resp = result.response;
      // if .text is a function -> call it
      if (typeof resp.text === 'function') {
        try {
          const t = resp.text();
          if (typeof t === 'string') return t;
        } catch (e) {
          // ignore
        }
      }
      // if response has candidates / content
      if (Array.isArray(resp?.candidates) && resp.candidates.length > 0) {
        const first = resp.candidates[0];
        if (typeof first?.content === 'string') return first.content;
        if (Array.isArray(first?.content?.parts)) {
          return first.content.parts.map((p: any) => p.text ?? '').join('');
        }
      }
      // some shapes: response.output[0].content[0].text
      if (Array.isArray(resp?.output) && resp.output.length > 0) {
        const out0 = resp.output[0];
        if (Array.isArray(out0?.content) && out0.content.length > 0) {
          const part = out0.content[0]?.text ?? out0.content.map((c: any) => c?.text ?? '').join('');
          if (typeof part === 'string' && part.length > 0) return part;
        }
      }
    }

    // 4) result.data or result.result
    if (typeof result?.data === 'string') return result.data;
    if (typeof result?.result === 'string') return result.result;

    // 5) Fallback: try to JSON.stringify then return
    return JSON.stringify(result);
  } catch (err: any) {
    return `__EXTRACTION_ERROR__: ${String(err)}`;
  }
}

/**
 * Validates and parses a raw string response from the AI.
 * Expects a JSON object somewhere in the returned string with { "keywords": [...] }.
 */
function parseAiResponse(rawResponse: string, expectedLength: number): string[] | null {
  try {
    if (!rawResponse || rawResponse.length === 0) {
      throw new Error('Empty raw response.');
    }

    // fast attempt: maybe the SDK returned raw JSON already
    let parsedJson: any = null;
    if (rawResponse.trim().startsWith('{') || rawResponse.trim().startsWith('[')) {
      parsedJson = JSON.parse(rawResponse);
    } else {
      // try to find the first {...} object inside the text
      const firstBracket = rawResponse.indexOf('{');
      const lastBracket = rawResponse.lastIndexOf('}');
      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error('Response did not contain a JSON object.');
      }
      const jsonString = rawResponse.substring(firstBracket, lastBracket + 1);
      parsedJson = JSON.parse(jsonString);
    }

    if (!parsedJson || !parsedJson.keywords || !Array.isArray(parsedJson.keywords)) {
      throw new Error('Parsed JSON has no "keywords" array.');
    }

    if (parsedJson.keywords.length !== expectedLength) {
      throw new Error(`Expected ${expectedLength} keywords but found ${parsedJson.keywords.length}.`);
    }

    // coerce to strings and trim
    const keywords = parsedJson.keywords.map((k: any) => String(k).trim());
    return keywords;
  } catch (error: any) {
    console.error('AI Response Validation Error:', error.message ?? error);
    console.error('Raw AI response preview:', rawResponse.slice(0, 1000));
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the prompt for the batch of titles.
 */
function buildPrompt(titles: string[]): string {
  return `
You are an expert e-commerce SEO and data analyst. Your task is to extract a short, generic, 2-4 word Google search term from a list of messy e-commerce product titles.

Rules:
1. The search term must represent the core product.
2. Do NOT include any brand names (e.g., "Joyroom").
3. Do NOT include promotional adjectives (e.g., "Luxury", "Hot Sale", "High Quality").
4. Do NOT include technical specifications (e.g., "3Pcs", "120W", "For iPhone 15 Pro Max").
5. Output exactly ONE JSON object and NOTHING else. The object must have a key "keywords" with an array of strings.
6. The order of the keywords must match the order of the titles.

Input:
${JSON.stringify({ titles })}

Output:
`;
}

/**
 * Main worker loop.
 */
async function main() {
  console.log('--- Starting Product Enrichment Worker ---');
  let totalProcessed = 0;

  while (true) {
    console.log(`\nFetching up to ${BATCH_SIZE} products to enrich...`);
    const productsToProcess = await prisma.winningProduct.findMany({
      where: { googleTrendKeyword: null, title: { not: null } },
      take: BATCH_SIZE,
    });

    if (productsToProcess.length === 0) {
      console.log('No more products to enrich. Worker finished.');
      break;
    }

    console.log(`Found ${productsToProcess.length} products.`);
    const titlesToSend = productsToProcess.map((p) => p.title!);
    const prompt = buildPrompt(titlesToSend);

    try {
      // Call the Gemini API
      const result: any = await genAI.models.generateContent({
        model: MODEL_NAME,
        // `contents` is the shape the SDK examples use; some SDK versions accept string too.
        contents: [{ parts: [{ text: prompt }] }],
        // Optional: you may tweak temperature, maxOutputTokens, safety settings here if your SDK supports them.
        // e.g. temperature: 0.0, maxOutputTokens: 512
        // If your SDK supports safetySettings on the request, you can add them here. Omitted to avoid type errors across versions.
      } as any);

      // Extract text robustly
      const rawResponse = extractTextFromResult(result);
      // If the quick extractor returns the entire object tag like {"keywords":...} or text with it
      const keywords = parseAiResponse(rawResponse, titlesToSend.length);

      if (!keywords) {
        console.error('Failed to validate AI response. Saving a debug snapshot to DB (no update) and skipping batch.');
        // Optional: Store response into a debug table/column for later analysis.
        console.error('RAW AI RESPONSE:', rawResponse.slice(0, 2000));
        // Skip this batch rather than blocking the worker
      } else {
        // Update DB in parallel
        const updatePromises = productsToProcess.map((product, index) =>
          prisma.winningProduct.update({
            where: { id: product.id },
            data: { googleTrendKeyword: keywords[index] },
          })
        );
        await Promise.all(updatePromises);
        totalProcessed += productsToProcess.length;
        console.log(`Updated ${productsToProcess.length} products.`);
      }
    } catch (err: any) {
      console.error('An error occurred during the AI API call:', err?.message ?? err);
      console.error('Full error:', err);
      // Decide: break or continue. We'll break to avoid rapid repeated failures.
      console.log('Stopping worker to prevent further errors. You can re-run it later.');
      break;
    }

    // polite pause between batches to avoid rate limits (adjust as needed)
    await sleep(500);
  }

  console.log(`\n--- Worker finished. Total products processed in this run: ${totalProcessed} ---`);
}

// run
main()
  .catch((e) => {
    console.error('Fatal error in worker:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
