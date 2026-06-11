import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingExperience } from "@/components/landing/LandingExperience";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export default async function LandingPage() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    redirect("/trending");
  }

  return <LandingExperience />;
}
