"use client";

import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials, getAvatarColors } from "@/lib/helper";
import { useShortValue } from "@/lib/format";

const rankLabel = (r: number) =>
  r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : String(r);

interface LeaderboardProps {
  reps?: {
    rank: number;
    userId: string;
    name: string;
    deals: number;
    revenue: number;
  }[];
  isLoading?: boolean;
}

export function Leaderboard({ reps = [], isLoading = false }: LeaderboardProps) {
  const t = useTranslations("dashboard.leaderboard");
  const shortValue = useShortValue();
  const maxRevenue = reps.reduce((max, r) => Math.max(max, r.revenue), 0) || 1;
  return (
    <Card className="shadow-none border-border/70 gap-0 py-0 h-full flex flex-col">
      <CardHeader className="border-b px-5 py-4">
        <div>
          <CardTitle className="text-sm tracking-tight">{t("title")}</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {t("subtitle")}
          </CardDescription>
        </div>
      </CardHeader>

      {isLoading ? (
        <CardContent className="px-3 pt-2 pb-2 flex-1 space-y-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              <Skeleton className="w-5 h-4 rounded shrink-0" />
              <Skeleton className="size-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24 rounded" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-1 w-16 rounded-full" />
                  <Skeleton className="h-3 w-8 rounded" />
                </div>
              </div>
              <Skeleton className="h-4 w-10 rounded shrink-0" />
            </div>
          ))}
        </CardContent>
      ) : reps.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-muted-foreground text-center px-4">
          <Users className="size-8 text-muted-foreground/40 mb-2" strokeWidth={1.5} />
          <p style={{ fontSize: 13, fontWeight: 500 }} className="text-foreground">{t("emptyTitle")}</p>
          <p style={{ fontSize: 11, marginTop: 2, maxWidth: 200 }} className="text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <CardContent className="px-3 pt-2 pb-2 flex-1 space-y-0.5">
          {reps.map((rep) => {
            const isFirst = rep.rank === 1;
            const barW = Math.round((rep.revenue / maxRevenue) * 64);

            return (
              <div
                key={rep.rank}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-default",
                  isFirst
                    ? "bg-secondary/50 border border-primary/20"
                    : "hover:bg-muted/60"
                )}
              >
                {/* Rank */}
                <span
                  className={cn(
                    "w-5 text-center shrink-0 leading-none",
                    isFirst ? "text-base" : "text-muted-foreground"
                  )}
                  style={isFirst ? {} : { fontSize: 12, fontWeight: 500 }}
                >
                  {rankLabel(rep.rank)}
                </span>

                {/* Avatar */}
                <Avatar
                  className="size-7 shrink-0"
                  style={isFirst ? { outline: "1.5px solid #C4C0F0", borderRadius: "50%" } : {}}
                >
                  <AvatarFallback
                    className="border-0"
                    style={{
                      background: getAvatarColors(rep.userId).bg,
                      color: getAvatarColors(rep.userId).color,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {getInitials(rep.name)}
                  </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "truncate leading-tight text-foreground",
                      isFirst ? "" : ""
                    )}
                    style={{ fontSize: 13, fontWeight: isFirst ? 600 : 400 }}
                  >
                    {rep.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: barW,
                        background: isFirst ? "#534AB7" : "#D3D1E8",
                      }}
                    />
                    <span
                      className="text-muted-foreground"
                      style={{ fontSize: 11 }}
                    >
                      {t("dealsCount", { count: rep.deals })}
                    </span>
                  </div>
                </div>

                {/* Revenue */}
                <span
                  className="shrink-0 tabular-nums"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isFirst ? "#534AB7" : "#1A1A18",
                  }}
                >
                  {shortValue(rep.revenue)}
                </span>
              </div>
            );
          })}
        </CardContent>
      )}

      <CardFooter className="border-t px-5 py-3 justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-primary hover:text-primary hover:bg-secondary/60 text-xs"
          asChild
        >
          <Link href="/reports">
            {t("viewFullReport")}
            <ArrowRight className="size-3" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
