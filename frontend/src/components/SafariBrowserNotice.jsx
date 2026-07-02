import logoUrl from '../assets/logo.png';

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

function UnsupportedCopy({ reason }) {
  if (reason === 'ios-unsupported') {
    return (
      <>
        <h1 className="font-heading text-2xl leading-tight text-neutral-900 sm:text-[1.75rem]">
          Calls are not supported on iPhone or iPad yet
        </h1>

        <p className="mt-4 text-base leading-relaxed text-neutral-600">
          Bloom Today calls work best in{' '}
          <span className="font-medium text-neutral-800">Chrome</span> or{' '}
          <span className="font-medium text-neutral-800">Edge</span> on a laptop or desktop.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="font-heading text-2xl leading-tight text-neutral-900 sm:text-[1.75rem]">
        Safari is not supported for calls yet
      </h1>

      <p className="mt-4 text-base leading-relaxed text-neutral-600">
        Bloom Today calls work best in{' '}
        <span className="font-medium text-neutral-800">Chrome</span> and{' '}
        <span className="font-medium text-neutral-800">Edge</span> because of
        Safari&apos;s strict voice and video permission rules.
      </p>
    </>
  );
}

export function SafariBrowserNotice({ reason = 'safari-unsupported' }) {
  return (
    <main className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-rose-50 via-white to-rose-50/80 px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg animate-fadeInUp">
        <div className="rounded-3xl border border-rose-100 bg-white/90 p-8 text-center shadow-xl shadow-rose-100/60 backdrop-blur-sm sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-100">
            <img src={logoUrl} alt="" className="h-10 w-10 object-contain" aria-hidden />
          </div>

          <UnsupportedCopy reason={reason} />

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
            <p className="text-sm font-medium text-rose-600">
              Hang tight, work is in progress
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              For now, please open Bloom Today in Chrome or Edge on a laptop or desktop
              for voice and video calls.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
