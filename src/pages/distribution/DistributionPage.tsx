import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, ChevronRight } from 'lucide-react';
import type { DistributionRelation } from '@/types/types';

const PAGE_SIZE = 30;

export default function DistributionPage() {
  const [relations, setRelations] = useState<DistributionRelation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function fetchRelations(searchPhone?: string) {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase
      .from('distribution_relations')
      .select('*, user:user_id(phone,nickname,member_level), parent:parent_id(phone,nickname)', { count: 'exact' });
    if (searchPhone) {
      // 先查用户ID
      const { data: u } = await supabase.from('users').select('id').eq('phone', searchPhone.trim()).maybeSingle();
      if (u) q = q.eq('user_id', u.id);
      else { toast.error('未找到该用户'); setRelations([]); setTotal(0); setLoading(false); return; }
    }
    const { data, count } = await q.order('level', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    setRelations(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchRelations(); }, [page]);

  function handleSearch() { setPage(1); fetchRelations(search); }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const LEVEL_COLOR = ['text-primary', 'text-accent', 'text-success', 'text-warning', 'text-muted-foreground'];

  return (
    <AdminLayout>
      <PageHeader title="分销关系查看" description={`共 ${total} 条关系记录`} />

      <div className="flex gap-2 mb-4 max-w-sm">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="输入用户手机号查询" onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="pl-8 h-8 text-xs bg-muted border-border" />
        </div>
        <Button size="sm" onClick={handleSearch} disabled={loading} className="h-8 text-xs shrink-0">查询</Button>
        {search && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPage(1); fetchRelations(); }}
          className="h-8 text-xs border border-border shrink-0">重置</Button>}
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['层级', '用户', '等级', '上级用户', '关系路径', '绑定时间'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : relations.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">暂无分销关系</td></tr>
            ) : relations.map((rel, i) => (
              <tr key={rel.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`text-xs font-medium ${LEVEL_COLOR[Math.min(rel.level - 1, 4)]}`}>
                    第 {rel.level} 层
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <p className="font-mono">{(rel.user as any)?.phone ?? '-'}</p>
                  <p className="text-muted-foreground">{(rel.user as any)?.nickname ?? ''}</p>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <span className={`${(rel.user as any)?.member_level === 'captain' ? 'text-primary' : (rel.user as any)?.member_level === 'member' ? 'text-accent' : 'text-muted-foreground'}`}>
                    {(rel.user as any)?.member_level === 'captain' ? '团长' : (rel.user as any)?.member_level === 'member' ? '会员' : '普通'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {rel.parent ? (
                    <div>
                      <p className="font-mono">{(rel.parent as any)?.phone ?? '-'}</p>
                      <p className="text-muted-foreground">{(rel.parent as any)?.nickname ?? ''}</p>
                    </div>
                  ) : <span className="text-muted-foreground">—（顶级）</span>}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-48 truncate">
                  <span className="font-mono text-muted-foreground text-xs">
                    {rel.path.split('/').filter(Boolean).slice(-4).join(' → ')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(rel.created_at).toLocaleDateString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-7 px-3 text-xs border border-border">上一页</Button>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="h-7 px-3 text-xs border border-border">下一页</Button>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="mt-4 p-3 bg-muted/50 border border-border rounded-sm text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-4">
          {[1,2,3,4].map(l => (
            <span key={l} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${['bg-primary','bg-accent','bg-success','bg-warning'][l-1]}`} />
              第 {l} 层
            </span>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
