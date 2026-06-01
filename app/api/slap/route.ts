import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Primary: dynamic free router for maximum availability
const PRIMARY_MODEL = 'openrouter/free';

// Fallback: stronger, more reliable model when the free router returns garbage JSON
const FALLBACK_MODEL = 'qwen/qwen-2.5-72b-instruct:free';

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

  async function callModel(model: string, idea: string) {
    const requestBody: any = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: idea },
      ],
      temperature: 0.75,
      max_tokens: 800,
    };

    if (model.includes('gemini')) {
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
      console.error('=== OpenRouter Upstream Error ===');
      console.error('Status:', orRes.status);
      console.error('Raw response:', errText);
      console.error('=================================');
      return null;
    }

    const data = await orRes.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim() || '';

    if (data?.model) {
      console.log(`[Success] Routed to model: ${data.model}`);
    }

    if (!content) return null;

    // Extract JSON
    let jsonStr = content;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const tryParse = (str: string) => {
      try { return JSON.parse(str); } catch { return null; }
    };

    let parsed = tryParse(jsonStr);

    // Repair attempt
    if (!parsed) {
      const repaired = jsonStr
        .replace(/'/g, '"')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, '$1');
      parsed = tryParse(repaired);
    }

    if (!parsed) {
      console.error('Failed to parse model JSON:', content);
      return null;
    }

    const roast = (parsed.roast || '').trim();
    const fix = Array.isArray(parsed.fix)
      ? parsed.fix.map((f: string) => f.trim()).filter(Boolean).slice(0, 3)
      : [];

    if (!roast || fix.length === 0) return null;

    return { roast, fix };
  }

  try {
    // First attempt with the dynamic free router
    let result = await callModel(PRIMARY_MODEL, idea);
    let usedFallback = false;

    // Fallback to Qwen 2.5 72B if primary gave bad output
    if (!result) {
      console.log('⚠️  [Fallback] openrouter/free failed to produce valid JSON. Retrying with qwen/qwen-2.5-72b-instruct:free...');
      usedFallback = true;
      result = await callModel(FALLBACK_MODEL, idea);
    }

    if (result) {
      if (usedFallback) {
        console.log('✅ [Fallback Success] Used Qwen 2.5 72B as backup model');
      }
      return NextResponse.json<SlapResponse>(result);
    }

    // Final generic fallback
    return NextResponse.json<SlapResponse>({
      roast: "We couldn't generate a structured roast for this idea.",
      fix: [
        'Clarify the core problem you are solving in one sentence.',
        'Define your target customer and how you reach them.',
        'Show traction or a clear next experiment before asking for money.',
      ],
    });
  } catch (err) {
    console.error('Slap API error:', err);
    return NextResponse.json<ErrorResponse>(
      { error: 'internal_error', message: 'Something went wrong while roasting. Please try again.' },
      { status: 500 }
    );
  }
}
