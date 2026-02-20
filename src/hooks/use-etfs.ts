import { useQuery } from "@tanstack/react-query";
import type { EtfQuote } from "@/lib/api";
import { fetchEtfQuotes } from "@/lib/api";

export function useEtfs() {
  return useQuery<EtfQuote[]>({
    queryKey: ["etfs"],
    queryFn: fetchEtfQuotes,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

