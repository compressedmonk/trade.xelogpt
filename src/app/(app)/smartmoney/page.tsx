import { getSmartMoney, getKols } from "@/lib/gmgn-client";
import { SmartMoneyClient } from "./SmartMoneyClient";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function SmartMoneyPage() {
  const [smartMoney, kols] = await Promise.all([
    getSmartMoney("sol", 50).catch(() => ({ list: [] })),
    getKols("sol", 30).catch(() => ({ list: [] })),
  ]);

  return <SmartMoneyClient smartMoney={smartMoney} kols={kols} />;
}
