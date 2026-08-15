// 移动端通用页头 - 带返回按钮
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  title: string;
  back?: string | true;   // true = navigate(-1)，string = 指定路径
  right?: React.ReactNode;
  className?: string;
  transparent?: boolean;
}

export default function MobileHeader({ title, back, right, className, transparent }: MobileHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof back === 'string') navigate(back);
    else navigate(-1);
  };

  return (
    <div
      className={cn(
        'flex items-center h-12 px-2 gap-1',
        transparent ? '' : 'bg-card border-b border-border',
        className
      )}
    >
      {back !== undefined && (
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-muted/60 shrink-0"
        >
          <ChevronLeft size={22} className="text-foreground" />
        </button>
      )}
      <h1 className={cn('flex-1 text-sm font-semibold text-foreground truncate', back === undefined && 'pl-2')}>
        {title}
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
