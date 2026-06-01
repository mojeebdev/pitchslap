import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Using OpenRouter's dynamic free router.
// This automatically selects from currently available free models,
// which is the most reliable way to use free tier without hardcoding unstable models.
const MODEL = 'openrouter/free';

const SYSTEM_PROMPT = `You are a brutally honest seed-stage venture capitalist who has seen 10,000 pitches. You do not use motivational language. When you receive a startup idea, respond ONLY in this JSON format: { roast: '3-4 sentence brutal critique', fix: ['actionable fix 1', 'actionable fix 2', 'actionable fix 3'] }. Be specific, not generic. No JSON markdown fences. Raw JSON only.`;

// In-memory rate limiter: IP -> array of request timestamps (sliding window)
const rateLimitMap = new Map<string, number[]>();

const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(req: NextRequest): string {
  // Vercel / proxies
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  // Fallback for local/dev
  return '127.0.0.1';
}

/**
 * Returns whether the IP is rate limited + how long to wait (in seconds).
 */
function checkRateLimit(ip: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip) || [];

  // Remove timestamps outside the current window
  timestamps = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    // Calculate seconds until the oldest request expires from the window
    const oldest = timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { limited: true, retryAfter };
  }

  // Record this request
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  // Occasional cleanup for long-running dev servers
  if (rateLimitMap.size > 2000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [key, tsArray] of rateLimitMap.entries()) {
      const filtered = tsArray.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, filtered);
      }
    }
  }

  return { limited: false };
}

interface SlapRequest {
  idea: string;
}

interface SlapResponse {
  roast: string;
  fix: string[];
}

interface ErrorResponse {
  error: string;
  message: string;
  retryAfter?: number;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const rateCheck = checkRateLimit(ip);
  if (rateCheck.limited) {
    return NextResponse.json<ErrorResponse>(
      {
        error: 'rate_limited',
        message: '5 requests per 5 minutes to save free tier tokens. Please wait before submitting again.',
        retryAfter: rateCheck.retryAfter,
      },
      { status: 429 }
    );
  }

  let body: SlapRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      { error: 'invalid_json', message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const idea = (body.idea || '').trim();

  if (!idea) {
    return NextResponse.json<ErrorResponse>(
      { error: 'missing_idea', message: 'Please provide your pitch idea.' },
      { status: 400 }
    );
  }

  if (idea.length < 20) {
    return NextResponse.json<ErrorResponse>(
      { error: 'idea_too_short', message: 'Give us at least a couple of sentences to work with.' },
      { status: 400 }
    );
  }

  if (idea.length > 2000) {
    return NextResponse.json<ErrorResponse>(
      { error: 'idea_too_long', message: 'Keep it under 2000 characters for best results.' },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json<ErrorResponse>(
      { error: 'config_error', message: 'API key not configured.' },
      { status: 500 }
    );
  }

  try {
    const requestBody: any = {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: idea },
      ],
      temperature: 0.75,
      max_tokens: 800,
    };

    // Only send reasoning parameter for Gemini models (Llama and others often reject unsupported fields)
    if (MODEL.includes('gemini')) {
      requestBody.reasoning = { effort: "minimal" };
    }

    const orRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pitchslap.mojeeb.xyz',
        'X-Title': 'PitchSlap',
      },
      body: JSON.stringify(requestBody),
    });

    if (!orRes.ok) {
      const errText = await orRes.text().catch(() => '');

      // Rich logging for debugging upstream issues
      console.error('=== OpenRouter Upstream Error ===');
      console.error('Status:', orRes.status);
      console.error('Raw response:', errText);
      console.error('=================================');

      let userMessage = 'The roast engine is having a moment. Try again in a minute.';
      let retryAfter: number | undefined;

      try {
        const parsed = JSON.parse(errText);
        const meta = parsed?.error?.metadata;
        const msg = parsed?.error?.message || '';

        console.log('[Debug] Parsed OpenRouter error:', parsed);

        if (orRes.status === 429 || parsed?.error?.code === 429) {
          const wait = meta?.retry_after_seconds ?? meta?.retry_after_seconds_raw;
          retryAfter = wait ? Math.ceil(Number(wait)) : 30;
          userMessage = `The free model is temporarily rate-limited. Please wait ~${retryAfter}s and try again.`;
          console.log('[Debug] Decided: Rate limited, retryAfter =', retryAfter);
        } else if (orRes.status === 404 || msg.toLowerCase().includes('no endpoints found')) {
          userMessage = 'This model is currently unavailable on the free tier. We are switching to a backup.';
          console.log('[Debug] Decided: Model not available (404 / no endpoints)');
        } else if (meta?.provider_name) {
          userMessage = `The model provider (${meta.provider_name}) is having issues. Try again shortly.`;
          console.log('[Debug] Decided: Provider issue →', meta.provider_name);
        } else {
          console.log('[Debug] Decided: Generic fallback');
        }
      } catch (parseErr) {
        console.error('[Debug] Failed to parse OpenRouter error body:', parseErr);
      }

      return NextResponse.json<ErrorResponse>(
        {
          error: 'upstream_error',
          message: userMessage,
          retryAfter,
        },
        { status: 502 }
      );
    }

    const data = await orRes.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim() || '';

    // Log which actual model was used (very useful when using openrouter/free)
    if (data?.model) {
      console.log(`[Success] Routed to model: ${data.model}`);
    }

    if (!content) {
      throw new Error('Empty response from model');
    }

    // Clean possible markdown fences or extra text
    let jsonStr = content;
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // Sometimes models add leading text; try to extract the first {...}
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: { roast?: string; fix?: string[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse model JSON:', content);
      // Fallback: treat whole as roast, no fixes
      return NextResponse.json<SlapResponse>({
        roast: content.slice(0, 600),
        fix: [
          'Clarify the core problem you are solving in one sentence.',
          'Define your target customer and how you reach them.',
          'Show traction or a clear next experiment before asking for money.',
        ],
      });
    }

    const roast = (parsed.roast || '').trim();
    const fix = Array.isArray(parsed.fix)
      ? parsed.fix.map((f: string) => f.trim()).filter(Boolean).slice(0, 3)
      : [];

    if (!roast || fix.length === 0) {
      throw new Error('Malformed JSON from model');
    }

    return NextResponse.json<SlapResponse>({ roast, fix });
  } catch (err) {
    console.error('Slap API error:', err);
    return NextResponse.json<ErrorResponse>(
      { error: 'internal_error', message: 'Something went wrong while roasting. Please try again.' },
      { status: 500 }
    );
  }
}
