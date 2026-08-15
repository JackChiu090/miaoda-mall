import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import MobileHeader from '@/components/mobile/MobileHeader';

interface Announcement {
  id: string;
  title: string;
  type: string;
  content: string;
  published_at: string;
}

const TYPE_LABELS: Record<string, string> = { notice: '通知', promotion: '活动', system: '系统' };

export default function MNoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from('announcements').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => { setData(data); setLoading(false); });
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="公告详情" back />

      <div className="px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32" />
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-muted-foreground">公告不存在</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs shrink-0 mt-1">{TYPE_LABELS[data.type] ?? data.type}</Badge>
              <h2 className="text-base font-bold text-foreground">{data.title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              发布时间：{data.published_at ? new Date(data.published_at).toLocaleString('zh-CN') : '—'}
            </p>
            <div className="border-t border-border pt-4">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{data.content || '（暂无内容）'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
