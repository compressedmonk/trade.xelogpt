import { getTrenches } from "@/lib/gmgn-client";
import { TrenchesClient } from "./TrenchesClient";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export default async function TrenchesPage() {
  const data = await getTrenches("sol") as {
    new_creation?: unknown[];
    pump?: unknown[];
    completed?: unknown[];
  };

  return (
    <TrenchesClient
      newCreation={data.new_creation ?? []}
      nearCompletion={data.pump ?? []}
      completed={data.completed ?? []}
    />
  );
}
