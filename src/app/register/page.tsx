import Link from "next/link";
import RegisterForm from "@/components/register/RegisterForm";

// Household sign-up + home survey. Public (not behind the console password).
// Household-facing: friendly "you" wording, nothing that needs explaining.

export const metadata = {
  title: "Sign up for freeze alerts · FreezeLine",
  description: "Get a plan for your home before a hard freeze: texts and calls from your water utility.",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-dvh justify-center bg-bg px-4 py-10 text-text sm:py-16">
      <div className="w-full max-w-xl">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Get ready for the next freeze</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Sign up and we&rsquo;ll text you a short plan for your home before a hard freeze: whether to drip a faucet, which one, and
          what else to do. If you can&rsquo;t do the steps yourself, we&rsquo;ll try to send help.
        </p>
        <div className="freeze-rule mt-6" />
        <RegisterForm />
        <p className="text-center text-xs text-muted">
          Water utility staff?{" "}
          <Link href="/console" className="text-accent underline-offset-2 hover:underline">
            Open City Operations
          </Link>
        </p>
      </div>
    </main>
  );
}
