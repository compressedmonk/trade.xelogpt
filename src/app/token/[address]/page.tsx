import { getTokenInfo, getTokenSecurity, getTokenHolders } from "@/lib/gmgn-client";
import { TokenDetail } from "./TokenDetail";

export const revalidate = 30;

interface PageProps {
  params: { address: string };
}

export default async function TokenPage({ params }: PageProps) {
  const chain = "sol";
  const address = params.address;

  const [info, security, holders] = await Promise.all([
    getTokenInfo(chain, address).catch(() => null),
    getTokenSecurity(chain, address).catch(() => null),
    getTokenHolders(chain, address, { limit: 20, tag: "smart_degen" }).catch(() => null),
  ]);

  return <TokenDetail address={address} info={info} security={security} holders={holders} />;
}
