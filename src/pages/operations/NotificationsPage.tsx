import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Send } from 'lucide-react';
import type { Notification } from '@/types/types';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', content: '', type: 'system' as Notification['type'],
    is_broadcast: true, target_phone: '',
  });

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await supabase.from('notifications').select('*', { count: 'exact' })
      .order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchItems(); }, [page]);

  async function handleSend() {
    if (!form.title || !form.content) { toast.error('请填写标题和内容'); return; }
    let user_id: string | null = null;
    if (!form.is_broadcast) {
      if (!form.target_phone) { toast.error('请输入目标用户手机号'); return; }
      const { data: user } = await supabase.from('users').select('id').eq('phone', form.target_phone).maybeSingle();
      if (!user) { toast.error('未找到该用户'); return; }
      user_id = user.id;
    }
    const { error } = await supabase.from('notifications').insert({
      title: form.title, content: form.content, type: form.type,
      is_broadcast: form.is_broadcast, is_read: false,
      user_id: user_id,
    });
    if (error) { toast.error('发送失败'); return; }
    toast.success(form.is_broadcast ? '广播通知已发送' : '通知已发送给指定用户');
    setDialogOpen(false);
    fetchItems();
  }

  const TYPE_LABEL: Record<string, string> = { system: '系统', order: '订单', account: '账户', promotion: '活动' };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="消息通知管理" description={`共 ${total} 条`}
        action={<Button size="sm" onClick={() => { setForm({ title: '', content: '', type: 'system', is_broadcast: true, target_phone: '' }); setDialogOpen(true); }} className="h-8 text-xs gap-1"><Plus size={13} />发送通知</Button>} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['标题', '类型', '发送范围', '发送时间'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">暂无通知记录</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-64 truncate">
                  <span className="font-medium">{item.title}</span>
                  <p className="text-muted-foreground text-xs truncate max-w-48">{item.content}</p>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-xs border border-border px-1.5 py-0.5 rounded-sm text-muted-foreground">
                    {TYPE_LABEL[item.type]}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {item.is_broadcast
                    ? <span className="text-xs text-accent">全体广播</span>
                    : <span className="text-xs text-muted-foreground">指定用户</span>}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">发送通知</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">通知标题 *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="通知标题" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">通知类型</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">系统通知</SelectItem>
                  <SelectItem value="order">订单通知</SelectItem>
                  <SelectItem value="account">账户通知</SelectItem>
                  <SelectItem value="promotion">活动通知</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">发送范围</Label>
              <div className="flex gap-2">
                <button onClick={() => setForm(f => ({ ...f, is_broadcast: true }))}
                  className={`flex-1 text-xs py-1.5 rounded-sm border transition-colors ${form.is_broadcast ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  全体用户（广播）
                </button>
                <button onClick={() => setForm(f => ({ ...f, is_broadcast: false }))}
                  className={`flex-1 text-xs py-1.5 rounded-sm border transition-colors ${!form.is_broadcast ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  指定用户
                </button>
              </div>
            </div>
            {!form.is_broadcast && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">目标用户手机号</Label>
                <Input value={form.target_phone} onChange={e => setForm(f => ({ ...f, target_phone: e.target.value }))}
                  placeholder="13800000000" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">通知内容 *</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="通知内容..." className="text-xs bg-muted border-border resize-none min-h-24" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSend} className="h-7 px-3 text-xs gap-1">
                <Send size={12} />发送
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
