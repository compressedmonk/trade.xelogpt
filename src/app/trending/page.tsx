import { getTrending } from "@/lib/gmgn-client";
import { TrendingClient } from "./TrendingClient";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function TrendingPage() {
  const [data1h, data5m, data24h] = await Promise.all([
    getTrending("sol", "1h", { limit: 50, order_by: "swaps" }),
    getTrending("sol", "5m", { limit: 50, order_by: "swaps" }),
    getTrending("sol", "24h", { limit: 50, order_by: "volume" }),
  ]);

  return (
    <TrendingClient
      data1h={data1h.rank}
      data5m={data5m.rank}
      data24h={data24h.rank}
    />
  );
}
