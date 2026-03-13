import React from 'react';
import { GoogleButton } from '../components/GoogleButton';

export function LandingPage({ onGoogleSignIn, loading, error }) {
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-6 animate-fadeInUp">
          <div className="w-12 h-12 rounded-full border-[3px] border-rose-200 border-t-rose-500 animate-spin-slow" />
          <p className="text-neutral-500 text-lg font-medium">Getting everything ready for you…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-white relative overflow-hidden">
      {/* Subtle pink glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-rose-100/40 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] rounded-full bg-rose-50/60 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center gap-8 max-w-md">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 text-rose-600 text-xs font-semibold uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          CalmNest
        </span>

        {/* Headline */}
        <h1 className="font-heading text-[clamp(2.4rem,8vw,3.8rem)] font-extrabold leading-[1.05] tracking-tight text-neutral-900">
          A gentle space<br />for new moms
        </h1>

        {/* Subtitle */}
        <p className="text-neutral-500 text-lg leading-relaxed max-w-sm">
          Your private mental health companion — check in, feel supported, and stay connected with the people who care about you.
        </p>

        {/* Google CTA */}
        <div className="mt-2">
          <GoogleButton onCredential={onGoogleSignIn} disabled={loading} />
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-xl border border-red-100">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
