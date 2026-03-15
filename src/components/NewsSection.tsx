import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { useNews } from "@/hooks/use-news";
import { Button } from "@/components/ui/button";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 rounded bg-muted" />
        <div className="h-3 rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function NewsSection() {
  const { data: articles, isLoading, isError, refetch } = useNews();

  return (
    <section id="news" className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Market News</h2>
        </div>
        <span className="text-xs text-muted-foreground">Precious metals &amp; commodities</span>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card py-12 text-center">
          <p className="text-sm text-muted-foreground">Could not load news. Check your connection.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {articles && articles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {article.source}
                </span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(article.publishedAt)}</span>
              </div>

              <h3 className="mb-2 line-clamp-2 text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                {article.title}
              </h3>

              {article.summary && (
                <p className="line-clamp-3 flex-1 text-xs text-muted-foreground leading-relaxed">
                  {article.summary}
                </p>
              )}

              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Read more <ExternalLink className="h-3 w-3" />
              </div>
            </a>
          ))}
        </div>
      )}

      {articles && articles.length === 0 && !isLoading && (
        <p className="text-center text-sm text-muted-foreground py-12">No news available right now.</p>
      )}
    </section>
  );
}
