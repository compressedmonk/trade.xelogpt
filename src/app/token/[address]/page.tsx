import { getTokenInfo, getTokenSecurity, getTokenHolders, getTokenSignals } from "@/lib/gmgn-client";
import { TokenDetail } from "./TokenDetail";

export const dynamic = "force-dynamic";
export const revalidate = 30;

interface PageProps {
  params: { address: string };
}

export default async function TokenPage({ params }: PageProps) {
  const chain = "sol";
  const address = params.address;

  const [info, security, holders, signals] = await Promise.all([
    getTokenInfo(chain, address).catch(() => null),
    getTokenSecurity(chain, address).catch(() => null),
    getTokenHolders(chain, address, { limit: 20, tag: "smart_degen" }).catch(() => null),
    getTokenSignals(chain, [
      { signal_type: [12, 13] },
      { signal_type: [6, 7, 11] },
    ]).catch(() => null),
  ]);

  return <TokenDetail address={address} info={info} security={security} holders={holders} signals={signals} />;
}
