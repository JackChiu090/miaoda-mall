import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Send, EyeOff } from 'lucide-react';
import type { Announcement } from '@/types/types';

const PAGE_SIZE = 20;

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ title: '', content: '', type: 'notice' as Announcement['type'] });

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await supabase.from('announcements').select('*', { count: 'exact' })
      .order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchItems(); }, [page]);

  function openCreate() {
    setEditing(null);
    setForm({ title: '', content: '', type: 'notice' });
    setDialogOpen(true);
  }

  function openEdit(item: Announcement) {
    setEditing(item);
    setForm({ title: item.title, content: item.content, type: item.type });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.content) { toast.error('请填写标题和内容'); return; }
    if (editing) {
      const { error } = await supabase.from('announcements').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast.error('更新失败'); return; }
      toast.success('公告已更新');
    } else {
      const { error } = await supabase.from('announcements').insert({ ...form, status: 'draft' });
      if (error) { toast.error('创建失败'); return; }
      toast.success('公告已创建为草稿');
    }
    setDialogOpen(false);
    fetchItems();
  }

  async function handlePublish(item: Announcement) {
    const { error } = await supabase.from('announcements')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('公告已发布');
    fetchItems();
  }

  async function handleWithdraw(item: Announcement) {
    const { error } = await supabase.from('announcements')
      .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('公告已下架');
    fetchItems();
  }

  const TYPE_LABEL: Record<string, string> = { notice: '通知', promotion: '活动', system: '系统' };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="公告通知管理" description={`共 ${total} 条`}
        action={<Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1"><Plus size={13} />新建公告</Button>} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['标题', '类型', '状态', '发布时间', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">暂无公告</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium max-w-64 truncate">{item.title}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-xs border border-border px-1.5 py-0.5 rounded-sm text-muted-foreground">
                    {TYPE_LABEL[item.type]}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {item.published_at ? new Date(item.published_at).toLocaleDateString('zh-CN') : '-'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}
                      className="h-6 w-6 p-0 border border-border">
                      <Pencil size={11} />
                    </Button>
                    {(item.status === 'draft') && (
                      <Button variant="ghost" size="sm" onClick={() => handlePublish(item)}
                        className="h-6 px-2 text-xs border border-success/40 text-success hover:bg-success/10">
                        <Send size={11} className="mr-1" />发布
                      </Button>
                    )}
                    {item.status === 'published' && (
                      <Button variant="ghost" size="sm" onClick={() => handleWithdraw(item)}
                        className="h-6 px-2 text-xs border border-border text-muted-foreground">
                        <EyeOff size={11} className="mr-1" />下架
                      </Button>
                    )}
                  </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">{editing ? '编辑公告' : '新建公告'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">标题 *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="公告标题" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">类型</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">通知</SelectItem>
                  <SelectItem value="promotion">活动</SelectItem>
                  <SelectItem value="system">系统</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">内容 *</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="公告内容..." className="text-xs bg-muted border-border resize-none min-h-32" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">保存草稿</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
