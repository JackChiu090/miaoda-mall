import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, CheckCircle, XCircle, Users } from 'lucide-react';

interface TeamStats {
  user_id: string;
  phone: string;
  nickname: string;
  member_level: string;
  direct_count: number;
  captain_direct_count: number;
  team_depth: number;
  is_qualified: boolean;
}

export default function TeamStatsPage() {
  const [stats, setStats] = useState<TeamStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 20;

  async function fetchStats() {
    setLoading(true);
    // 获取团长列表
    let q = supabase.from('users').select('id,phone,nickname,member_level', { count: 'exact' })
      .eq('member_level', 'captain');
    if (search) q = q.or(`phone.ilike.%${search}%,nickname.ilike.%${search}%`);
    const { data: captains, count, error } = await q
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE - 1);
    if (error || !captains) { setLoading(false); toast.error('加载失败'); return; }
    setTotal(count ?? 0);

    // 对每位团长统计团队数据
    const result: TeamStats[] = await Promise.all(captains.map(async (cap: any) => {
      const { count: directCount } = await supabase.from('distribution_relations')
        .select('*', { count: 'exact', head: true }).eq('parent_id', cap.id);
      const { count: captainDirectCount } = await supabase
        .from('distribution_relations')
        .select('user:user_id(member_level)', { count: 'exact', head: true })
        .eq('parent_id', cap.id);
      const { data: depths } = await supabase.from('distribution_relations')
        .select('level').eq('user_id', cap.id).maybeSingle();
      const maxDepth = depths ? (depths as any).level : 1;
      const isQualified = (directCount ?? 0) >= 3 && maxDepth >= 4;
      return {
        user_id: cap.id, phone: cap.phone, nickname: cap.nickname,
        member_level: cap.member_level,
        direct_count: directCount ?? 0,
        captain_direct_count: captainDirectCount ?? 0,
        team_depth: maxDepth,
        is_qualified: isQualified,
      };
    }));
    setStats(result);
    setLoading(false);
  }

  useEffect(() => { fetchStats(); }, [page, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="团长团队数据统计" description="达标条件：直推 ≥3 人 + 团队层级 ≥4 层" />

      <div className="flex gap-2 mb-4 max-w-sm">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索团长手机号/昵称"
            onKeyDown={e => e.key === 'Enter' && fetchStats()}
            className="pl-8 h-8 text-xs bg-muted border-border" />
        </div>
        <Button size="sm" onClick={fetchStats} disabled={loading} className="h-8 text-xs shrink-0">查询</Button>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['团长', '直推人数', '团队层级', '是否达标', '直推≥3', '层级≥4'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : stats.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">
                {search ? '未找到匹配团长' : '暂无团长数据'}
              </td></tr>
            ) : stats.map((s, i) => (
              <tr key={s.user_id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Users size={12} className="text-primary shrink-0" />
                    <div>
                      <p className="font-mono">{s.phone}</p>
                      <p className="text-muted-foreground">{s.nickname || '-'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <span className={`font-medium font-mono ${s.direct_count >= 3 ? 'text-success' : 'text-warning'}`}>
                    {s.direct_count}
                  </span>
                  <span className="text-muted-foreground ml-1">人</span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <span className={`font-medium font-mono ${s.team_depth >= 4 ? 'text-success' : 'text-warning'}`}>
                    {s.team_depth}
                  </span>
                  <span className="text-muted-foreground ml-1">层</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {s.is_qualified ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle size={12} />已达标
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <XCircle size={12} />未达标
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {s.direct_count >= 3
                    ? <CheckCircle size={14} className="text-success" />
                    : <XCircle size={14} className="text-warning" />}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {s.team_depth >= 4
                    ? <CheckCircle size={14} className="text-success" />
                    : <XCircle size={14} className="text-warning" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>共 {total} 位团长，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-7 px-3 text-xs border border-border">上一页</Button>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="h-7 px-3 text-xs border border-border">下一页</Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
