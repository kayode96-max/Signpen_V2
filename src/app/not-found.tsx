import Link from "next/link";

export default function NotFound() {
  return (
    <div className="dark flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-black via-zinc-950 to-black px-4 py-16 text-center text-white">
      <p className="text-sm font-medium tracking-wide text-zinc-500">404</p>
      <h1 className="mt-3 max-w-md font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
        We couldn&apos;t find that shirt
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400 sm:text-base">
        The link may be mistyped, or this sign-out board may have been removed.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-sm">
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
        >
          Create your own shirt
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-transparent px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Go to Signpen home
        </Link>
      </div>
    </div>
  );
}
