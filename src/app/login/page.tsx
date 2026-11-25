import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/server/consoleAuth";

// Demo mode: there is no sign-in. An old link to /login goes straight on to where it was headed.
// The password form (CONSOLE_PASSWORD, /api/login) comes back from git history when a water utility
// gets a real sign-in.

export const metadata = { title: "FreezeLine" };

async function Forward({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection();
  const q = await searchParams;
  redirect(safeNext(typeof q.next === "string" ? q.next : undefined));
  return null;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Forward searchParams={searchParams} />
    </Suspense>
  );
}
