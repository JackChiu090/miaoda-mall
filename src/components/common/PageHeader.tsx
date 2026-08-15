import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** 是否显示返回按钮，默认 true */
  showBack?: boolean;
}

export default function PageHeader({ title, description, action, className, showBack = true }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="flex items-start gap-2 min-w-0">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            aria-label="返回"
          >
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-foreground leading-tight">{title}</h1>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
