import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Ban, CheckCircle } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/roles';
import type { AdminRole } from '@/lib/roles';

interface AdminProfile {
  id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function AdminAccountsPage() {
  const [items, setItems] = useState<AdminProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 新增弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'operator' as AdminRole });

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<AdminProfile | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', role: 'operator' as AdminRole });
  const [editing, setEditing] = useState(false);

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchItems(); }, [page]);

  // 新增管理员（通过 Edge Function，需要 service_role 创建 Auth 用户）
  async function handleCreate() {
    if (!form.email || !form.password || !form.display_name) {
      toast.error('请填写完整信息');
      return;
    }
    if (form.password.length < 6) {
      toast.error('密码至少 6 位');
      return;
    }
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(form),
    });
    const result = await res.json();
    setCreating(false);
    if (!res.ok || result.error) {
      toast.error(result.error ?? '创建失败');
      return;
    }
    toast.success('管理员账号已创建');
    setCreateOpen(false);
    setForm({ email: '', password: '', display_name: '', role: 'operator' });
    fetchItems();
  }

  // 编辑管理员
  async function handleEdit() {
    if (!editTarget) return;
    setEditing(true);
    const { error } = await supabase
      .from('admin_profiles')
      .update({ display_name: editForm.display_name, role: editForm.role })
      .eq('id', editTarget.id);
    setEditing(false);
    if (error) { toast.error('更新失败'); return; }
    toast.success('管理员信息已更新');
    setEditTarget(null);
    fetchItems();
  }

  // 禁用 / 启用
  async function toggleActive(item: AdminProfile) {
    const { error } = await supabase
      .from('admin_profiles')
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success(item.is_active ? '账号已禁用' : '账号已启用');
    fetchItems();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader
        title="管理员账号"
        description={`共 ${total} 个管理员账号`}
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 h-8 text-xs">
            <Plus size={13} />新增管理员
          </Button>
        }
      />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['邮箱', '显示名称', '角色', '状态', '创建时间', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">暂无管理员账号</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">{item.email}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{item.display_name}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${
                    item.role === 'super_admin' ? 'bg-primary/15 text-primary' :
                    item.role === 'operator' ? 'bg-accent/15 text-accent-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {ROLE_LABELS[item.role]}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <StatusBadge status={item.is_active ? 'active' : 'disabled'} />
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm"
                      onClick={() => { setEditTarget(item); setEditForm({ display_name: item.display_name, role: item.role }); }}
                      className="h-6 px-2 text-xs border border-border">
                      <Pencil size={11} className="mr-1" />编辑
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => toggleActive(item)}
                      disabled={item.role === 'super_admin'}
                      className={`h-6 px-2 text-xs border ${item.is_active
                        ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                        : 'border-success/40 text-success hover:bg-success/10'
                      } disabled:opacity-40`}>
                      {item.is_active
                        ? <><Ban size={11} className="mr-1" />禁用</>
                        : <><CheckCircle size={11} className="mr-1" />启用</>
                      }
                    </Button>
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

      {/* 新增管理员弹窗 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">新增管理员账号</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">邮箱</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="example@domain.com" className="h-8 text-xs bg-muted border-border" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">密码（至少 6 位）</Label>
              <Input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="登录密码" className="h-8 text-xs bg-muted border-border" type="password" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">显示名称</Label>
              <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="如：运营小李" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as AdminRole }))}>
                <SelectTrigger className="h-8 text-xs bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">运营</SelectItem>
                  <SelectItem value="customer_service">客服</SelectItem>
                  <SelectItem value="super_admin">超级管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating} className="h-7 px-3 text-xs">
                {creating ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑管理员弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">编辑管理员信息</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">邮箱（不可修改）</Label>
              <Input value={editTarget?.email ?? ''} disabled className="h-8 text-xs bg-muted border-border opacity-60" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">显示名称</Label>
              <Input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as AdminRole }))}>
                <SelectTrigger className="h-8 text-xs bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">运营</SelectItem>
                  <SelectItem value="customer_service">客服</SelectItem>
                  <SelectItem value="super_admin">超级管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleEdit} disabled={editing} className="h-7 px-3 text-xs">
                {editing ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
