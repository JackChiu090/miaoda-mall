import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Bell } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

interface Announcement {
  id: string;
  title: string;
  type: string;
  published_at: string;
  content: string;
}

const TYPE_LABELS: Record<string, string> = { notice: '通知', promotion: '活动', system: '系统' };
const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  notice: 'default', promotion: 'secondary', system: 'outline',
};

export default function MNoticesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('announcements')
      .select('id,title,type,published_at,content')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .then(({ data }) => { setList(data ?? []); setLoading(false); });
  }, []);

  const filtered = list.filter(a => a.title.includes(search));

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="平台公告" back />

      <div className="px-4 py-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索公告" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="px-4 space-y-2 pb-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bell size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无公告</p>
          </div>
        ) : (
          filtered.map(a => (
            <Link
              key={a.id}
              to={`/m/notice/${a.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start gap-2">
                <Badge variant={TYPE_VARIANTS[a.type] ?? 'outline'} className="text-xs px-1.5 shrink-0 mt-0.5">
                  {TYPE_LABELS[a.type] ?? a.type}
                </Badge>
                <p className="text-sm font-medium text-foreground flex-1">{a.title}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.content}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {a.published_at ? new Date(a.published_at).toLocaleString('zh-CN') : ''}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
