import { Card, CardContent } from "../../../shared/components/ui/card";
import { cn } from "../../../shared/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  className?: string;
  valueClassName?: string;
}

export function KPICard({ title, value, icon: Icon, trend, trendLabel, className, valueClassName }: KPICardProps) {
  return (
    <Card className={cn("overflow-hidden border-white/10 glass relative group", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-zinc-400">{title}</p>
          <div className="p-2 bg-white/5 rounded-lg text-zinc-300">
            <Icon className="w-5 h-5" />
          </div>
        </div>
        
        <div className="flex items-baseline space-x-2">
          <h3 className={cn("text-3xl font-bold text-white tracking-tight", valueClassName)}>
            {value}
          </h3>
        </div>
        
        {trend !== undefined && (
          <div className="mt-4 flex items-center text-sm">
            <span className={cn(
              "flex items-center font-medium mr-2",
              trend > 0 ? "text-emerald-400" : trend < 0 ? "text-rose-400" : "text-zinc-400"
            )}>
              {trend > 0 ? <ArrowUpIcon className="w-4 h-4 mr-1" /> : trend < 0 ? <ArrowDownIcon className="w-4 h-4 mr-1" /> : <MinusIcon className="w-4 h-4 mr-1" />}
              {Math.abs(trend)}%
            </span>
            <span className="text-zinc-500">{trendLabel || "vs last month"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
