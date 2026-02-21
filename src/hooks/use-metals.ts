import { useQuery } from "@tanstack/react-query";
import type { MetalData } from "@/lib/metals-data";
import { fetchMetalsData } from "@/lib/api";

export function useMetals() {
  return useQuery<MetalData[]>({
    queryKey: ["metals"],
    queryFn: fetchMetalsData,
    refetchInterval: 1_800_000,
    staleTime: 1_800_000,
    // Keep previous data while refetching (prevents showing $0.00 during refresh)
    placeholderData: (previousData) => previousData,
    // Retry failed requests once with delay
    retry: 1,
    retryDelay: 2000, // 2 seconds
  });
}

