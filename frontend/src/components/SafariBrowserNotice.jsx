import logoUrl from '../assets/logo.png';
import { getChromeDeepLinkUrl, isIOSDevice } from '../lib/mediaPermissions';

function BrowserPill({ name, colors }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium shadow-sm"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: colors.dot }}
        aria-hidden
      />
      {name}
    </span>
  );
}

export function SafariBrowserNotice() {
  const showChromeLink = isIOSDevice();
  const chromeUrl = showChromeLink ? getChromeDeepLinkUrl() : '';

  return (
    <main className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-rose-50 via-white to-rose-50/80 px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg animate-fadeInUp">
        <div className="rounded-3xl border border-rose-100 bg-white/90 p-8 text-center shadow-xl shadow-rose-100/60 backdrop-blur-sm sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-100">
            <img src={logoUrl} alt="" className="h-10 w-10 object-contain" aria-hidden />
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-500">
            Safari detected
          </p>

          <h1 className="mt-3 font-heading text-2xl leading-tight text-neutral-900 sm:text-[1.75rem]">
            Hey — we see you&apos;re using Safari
          </h1>

          <p className="mt-4 text-base leading-relaxed text-neutral-600">
            Bloom Today works best in{' '}
            <span className="font-medium text-neutral-800">Chrome</span> and{' '}
            <span className="font-medium text-neutral-800">Edge</span> because of
            Safari&apos;s strict voice and video permission rules.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <BrowserPill
              name="Chrome"
              colors={{ bg: '#eef6ff', text: '#1a4f9c', dot: '#4285f4' }}
            />
            <BrowserPill
              name="Edge"
              colors={{ bg: '#eef4ff', text: '#1e3a8a', dot: '#0078d4' }}
            />
          </div>

          <div className="mt-8 rounded-2xl bg-rose-50/80 px-5 py-4 ring-1 ring-rose-100">
            <div className="mx-auto mb-3 flex w-fit items-center gap-2 text-rose-600">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
              <span className="text-sm font-medium">Hang tight — work is in progress</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-500">
              We&apos;re improving Safari support. For now, please open Bloom Today in Chrome or Edge
              for voice and video calls.
            </p>
          </div>

          {showChromeLink ? (
            <a
              href={chromeUrl}
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-rose-500 px-5 py-3.5 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px]"
            >
              Open in Chrome
            </a>
          ) : (
            <p className="mt-8 text-sm leading-relaxed text-neutral-500">
              Copy this page&apos;s address and paste it into Chrome or Edge to continue.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
