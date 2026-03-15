import { useQuery } from "@tanstack/react-query";

export type NewsArticle = {
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
};

async function fetchNews(): Promise<NewsArticle[]> {
  const res = await fetch("/api/news");
  if (!res.ok) throw new Error(`News fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.articles) ? data.articles : [];
}

export function useNews() {
  return useQuery({
    queryKey: ["news"],
    queryFn: fetchNews,
    refetchInterval: 1_800_000,
    staleTime: 1_800_000,
    retry: 1,
  });
}
