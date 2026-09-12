import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardAction,
  CardDescription,
} from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconBg = "#EEEDFE",
  iconColor = "#534AB7",
}: StatCardProps) {
  return (
    <Card className="gap-0 shadow-none border-border/70 py-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardAction>
          <div
            className="size-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: iconBg }}
          >
            <Icon size={14} color={iconColor} strokeWidth={2} />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        <span
          className="text-foreground tracking-tight"
          style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
