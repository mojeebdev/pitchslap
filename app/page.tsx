"use client";

import React, { useState, useEffect, useRef } from "react";
import Logo from "./components/Logo";

interface SlapResult {
  roast: string;
  fix: string[];
}

export default function PitchSlap() {
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [displayedRoast, setDisplayedRoast] = useState("");

  const outputRef = useRef<HTMLDivElement>(null);
  const rateLimitIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Typewriter effect for the roast
  useEffect(() => {
    if (!result) {
      return;
    }

    // Clear any previous animation
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
    }

    const fullText = result.roast;
    let i = 0;

    typewriterIntervalRef.current = setInterval(() => {
      if (i < fullText.length) {
        setDisplayedRoast(fullText.slice(0, i + 1));
        i++;
      } else {
        if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
      }
    }, 18); // ~55 chars/sec — feels like a sharp read

    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
    };
  }, [result]);

  // Rate limit countdown
  useEffect(() => {
    if (rateLimitSeconds === null || rateLimitSeconds <= 0) {
      if (rateLimitIntervalRef.current) {
        clearInterval(rateLimitIntervalRef.current);
        rateLimitIntervalRef.current = null;
      }
      return;
    }

    rateLimitIntervalRef.current = setInterval(() => {
      setRateLimitSeconds((prev) => {
        if (prev === null || prev <= 1) {
          if (rateLimitIntervalRef.current) {
            clearInterval(rateLimitIntervalRef.current);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (rateLimitIntervalRef.current) {
        clearInterval(rateLimitIntervalRef.current);
      }
    };
  }, [rateLimitSeconds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
      if (rateLimitIntervalRef.current) clearInterval(rateLimitIntervalRef.current);
    };
  }, []);

  const getFirstSentence = (text: string): string => {
    if (!text) return "";
    const match = text.match(/^[^.!?]+[.!?]?/);
    let sentence = match ? match[0].trim() : text.slice(0, 140);
    // Remove trailing punctuation for tweet flow if needed
    sentence = sentence.replace(/[.!?]+$/, "");
    return sentence;
  };

  const handleShare = () => {
    if (!result) return;

    const first = getFirstSentence(result.roast);
    const tweetText = `Just got my pitch slapped. ${first} — fixed it with PitchSlap https://pitchslap.vercel.app`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const scrollToOutput = () => {
    // Small delay so the cards have rendered
    setTimeout(() => {
      outputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = idea.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setDisplayedRoast("");

    try {
      const res = await fetch("/api/slap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "rate_limited") {
          setRateLimitSeconds(data.retryAfter ?? 60);
          setError(data.message || "Rate limited. One pitch per minute.");
        } else if (data.error === "upstream_error") {
          // OpenRouter / model provider issues
          if (data.retryAfter) {
            setRateLimitSeconds(data.retryAfter);
          }
          setError(data.message || "The roast engine is having issues. Please try again shortly.");
        } else {
          setError(data.message || "Something went wrong. Try again.");
        }
        return;
      }

      if (data.roast && Array.isArray(data.fix)) {
        setResult({ roast: data.roast, fix: data.fix });
        // Scroll down to see the beautiful pain
        scrollToOutput();
      } else {
        setError("Received malformed response. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setDisplayedRoast("");
    setError(null);
    setIdea("");
    // Focus the textarea for next victim
    const ta = document.getElementById("pitch-input") as HTMLTextAreaElement | null;
    ta?.focus();
  };

  const canSubmit = idea.trim().length > 20 && !loading && !rateLimitSeconds;

  return (
    <div className="min-h-screen bg-[#0A0908] text-[#f0ebe4]">
      {/* HERO — full viewport, form centered */}
      <section className="hero-bg relative min-h-screen flex items-center justify-center px-5 pt-16 pb-10">
        {/* Dark overlay for text legibility */}
        <div className="hero-overlay absolute inset-0" />

        {/* Top-left logo */}
        <div className="absolute top-6 left-6 z-10">
          <Logo size={44} />
        </div>

        <div className="relative z-10 w-full max-w-2xl mx-auto text-center">
          {/* Product name */}
          <h1 className="product-name text-[4.25rem] sm:text-[5.1rem] md:text-[5.75rem] mb-3 tracking-[-1.5px]">
            PitchSlap
          </h1>

          {/* Tagline */}
          <p className="font-mono text-sm sm:text-base text-[#a8a29e] tracking-[0.08em] uppercase mb-9">
            Brutally honest seed-stage feedback. No sugarcoating.
          </p>

          {/* The form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="pitch-input"
                className="section-label block mb-2 text-left text-[#ff3434]"
              >
                YOUR PITCH
              </label>
              <textarea
                id="pitch-input"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="We help indie makers validate their startup ideas in 48 hours using AI-generated customer interviews and automated landing page tests. We charge $29/mo..."
                className="pitch-textarea w-full min-h-[138px] rounded-sm px-5 py-4 text-[15px] leading-relaxed placeholder:text-[#6b665f]"
                disabled={loading}
                maxLength={2000}
              />
              <div className="flex justify-between text-[11px] text-[#6b665f] mt-1.5 px-1 font-mono tracking-wide">
                <span>2–5 sentences. Be specific.</span>
                <span>{idea.length}/2000</span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="slap-button w-full py-3.5 text-sm rounded-sm active:scale-[0.985] disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="loading-dots inline-block">ROASTING YOUR PITCH</span>
              ) : rateLimitSeconds !== null ? (
                `WAIT ${rateLimitSeconds}s`
              ) : (
                "SLAP MY PITCH"
              )}
            </button>
          </form>

          {/* Error messages */}
          {error && (
            <div className="mt-4 text-left">
              <div className="font-mono text-sm text-[#ff3434] bg-[#1a1514] border border-[#3a2a28] px-4 py-3 rounded-sm">
                {error}
                {rateLimitSeconds !== null && (
                  <div className="mt-2 text-[#f0ebe4] text-base font-medium">
                    You can submit again in{" "}
                    <span className="font-mono text-[#ff3434] text-lg tabular-nums">
                      {rateLimitSeconds}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tiny legal-ish note */}
          <p className="mt-8 text-[10px] text-[#56514a] font-mono tracking-[0.1em]">
            3 REQUESTS PER MINUTE PER IP • NO DATA STORED
          </p>
        </div>

        {/* Scroll hint (only when no result yet) */}
        {!result && !loading && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:block">
            <div className="text-[#56514a] text-xs font-mono tracking-[3px] flex flex-col items-center">
              SCROLL FOR OUTPUT
              <span className="text-lg leading-none mt-0.5">↓</span>
            </div>
          </div>
        )}
      </section>

      {/* OUTPUT SECTION — appears after submission */}
      {result && (
        <section ref={outputRef} className="max-w-2xl mx-auto px-5 pb-20 pt-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="section-label text-[#ff3434] mb-1">THE VERDICT</div>
              <div className="font-display text-3xl italic tracking-tight text-[#f5f0e9]">
                Your pitch, stripped bare.
              </div>
            </div>
            <button
              onClick={handleReset}
              className="font-mono text-xs uppercase tracking-[0.15em] border border-[#3f3830] hover:border-[#ff3434] hover:text-[#ff3434] px-4 py-2 rounded-sm transition-colors"
            >
              SLAP ANOTHER
            </button>
          </div>

          {/* THE ROAST */}
          <div className="roast-card p-6 sm:p-7 mb-6">
            <div className="section-label text-[#ff3434] mb-4 tracking-[0.2em]">
              [THE ROAST]
            </div>
            <div className="ai-output whitespace-pre-wrap">
              {displayedRoast}
              {displayedRoast.length < result.roast.length && (
                <span className="inline-block w-[2px] h-[1.1em] bg-[#ff3434] align-[-2px] ml-px animate-pulse" />
              )}
            </div>
          </div>

          {/* THE FIX */}
          <div className="fix-card p-6 sm:p-7 mb-8">
            <div className="section-label text-[#34ff8a] mb-4 tracking-[0.2em]">
              [THE FIX]
            </div>
            <ul className="space-y-3">
              {result.fix.map((item, idx) => (
                <li key={idx} className="fix-bullet ai-output text-[#e8e3db]">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Divider */}
          <div className="divider my-6" />

          {/* Share to X */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <button
              onClick={handleShare}
              className="share-button px-5 py-2.5 rounded-sm flex items-center gap-2"
            >
              <span>POST THE PAIN ON X</span>
              <span aria-hidden="true">↗</span>
            </button>

            <p className="text-[11px] text-[#6b665f] font-mono max-w-[260px]">
              Share your roast. Maybe it’ll save another founder from themselves.
            </p>
          </div>
        </section>
      )}

      {/* Credit Footer — always visible */}
      <footer className="text-center py-8 text-[#56514a] text-[10px] font-mono tracking-[0.05em]">
        Built by{" "}
        <a
          href="https://x.com/mojeebeth"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#ff3434] underline underline-offset-2 transition-colors"
        >
          @mojeebeth
        </a>{" "}
        for the 30 Days of Vibeathon challenge •{" "}
        <a
          href="https://mojeeb.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#ff3434] underline underline-offset-2 transition-colors"
        >
          mojeeb.xyz
        </a>
      </footer>
    </div>
  );
}
