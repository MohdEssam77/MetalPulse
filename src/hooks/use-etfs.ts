import { useQuery } from "@tanstack/react-query";
import type { EtfQuote } from "@/lib/api";
import { fetchEtfQuotes } from "@/lib/api";

export function useEtfs() {
  return useQuery<EtfQuote[]>({
    queryKey: ["etfs"],
    queryFn: fetchEtfQuotes,
    refetchInterval: 1_800_000,
    staleTime: 1_800_000,
  });
}

