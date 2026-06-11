import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function LandingPage() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    redirect("/trending");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 animate-fade-in">
      <div className="text-center mb-8 space-y-3">
        <h1 className="text-4xl font-bold text-gradient text-glow">Litt-Analyzer</h1>
        <p className="text-gray-400 text-lg max-w-md">
          Személyes Solana trading terminál — trending tokenek, KOL követés, copy trade.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
