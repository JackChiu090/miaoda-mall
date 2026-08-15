import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ElementType;
  className?: string;
}

export default function KpiCard({ title, value, unit, change, changeLabel, icon: Icon, className }: KpiCardProps) {
  const isUp = change !== undefined && change > 0;
  const isDown = change !== undefined && change < 0;

  return (
    <div className={cn('bg-card border border-border rounded-sm p-4', className)}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs text-muted-foreground leading-tight">{title}</p>
        {Icon && <Icon size={14} className="text-muted-foreground shrink-0 mt-0.5" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="kpi-number text-2xl font-medium text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {isUp ? (
            <TrendingUp size={12} className="text-success" />
          ) : isDown ? (
            <TrendingDown size={12} className="text-destructive" />
          ) : (
            <Minus size={12} className="text-muted-foreground" />
          )}
          <span className={cn('text-xs', isUp ? 'text-success' : isDown ? 'text-destructive' : 'text-muted-foreground')}>
            {change > 0 ? '+' : ''}{change}%
          </span>
          {changeLabel && <span className="text-xs text-muted-foreground">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
