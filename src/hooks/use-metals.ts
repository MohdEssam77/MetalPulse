import { useQuery } from "@tanstack/react-query";
import type { MetalData } from "@/lib/metals-data";
import { fetchMetalsData } from "@/lib/api";

export function useMetals() {
  return useQuery<MetalData[]>({
    queryKey: ["metals"],
    queryFn: fetchMetalsData,
    // Refetch every 2 minutes (120 seconds) for live updates
    // React Query will cache the data, so this won't spam the API
    refetchInterval: 120_000, // 2 minutes
    // Data is considered fresh for 2 minutes (matches refetchInterval)
    // This prevents unnecessary refetches if component re-renders
    staleTime: 120_000, // 2 minutes
    // Keep previous data while refetching (prevents showing $0.00 during refresh)
    placeholderData: (previousData) => previousData,
    // Retry failed requests once with delay
    retry: 1,
    retryDelay: 2000, // 2 seconds
  });
}

