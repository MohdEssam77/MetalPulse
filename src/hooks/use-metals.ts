import { useQuery } from "@tanstack/react-query";
import type { MetalData } from "@/lib/metals-data";
import { fetchMetalsData } from "@/lib/api";

export function useMetals() {
  return useQuery<MetalData[]>({
    queryKey: ["metals"],
    queryFn: fetchMetalsData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

