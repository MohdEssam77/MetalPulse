import { useQuery } from "@tanstack/react-query";
import type { EtfQuote } from "@/lib/api";
import { fetchEtfQuotes } from "@/lib/api";

export function useEtfs() {
  return useQuery<EtfQuote[]>({
    queryKey: ["etfs"],
    queryFn: fetchEtfQuotes,
    // Refetch every 2 minutes (120 seconds) for live updates
    // React Query will cache the data, so this won't spam the API
    refetchInterval: 120_000, // 2 minutes
    // Data is considered fresh for 2 minutes (matches refetchInterval)
    // This prevents unnecessary refetches if component re-renders
    staleTime: 120_000, // 2 minutes
  });
}

