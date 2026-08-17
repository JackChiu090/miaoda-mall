// 9:29 体验商家进货资格管理
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Search, Plus, Trash2, Clock, CheckCircle2, Users } from 'lucide-react';

interface AccessRow {
  id: string;
  user_id: string;
  added_by_admin: string | null;
  added_at: string;
  is_used: boolean;
  used_at: string | null;
  notes: string | null;
  user: { phone: string; nickname: string; merchant_type: string } | null;
}

interface UserResult {
  id: string;
  phone: string;
  nickname: string;
  merchant_type: string;
}

export default function RushListPage() {
  const [list, setList] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('rush_early_access')
      .select('id,user_id,added_by_admin,added_at,is_used,used_at,notes,user:users(phone,nickname,merchant_type)')
      .order('added_at', { ascending: false });
    setList((data as unknown as AccessRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function searchUser() {
    if (!phoneSearch.trim()) return;
    const { data } = await supabase
      .from('users')
      .select('id,phone,nickname,merchant_type')
      .ilike('phone', `%${phoneSearch.trim()}%`)
      .limit(10);
    setUserResults((data as UserResult[]) ?? []);
  }

  async function handleAdd() {
    if (!selectedUser) { toast.error('请先选择用户'); return; }
    setSaving(true);
    const { error } = await supabase.from('rush_early_access').insert({
      user_id: selectedUser.id,
      added_by_admin: 'admin',
      notes: notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? '该用户已在9:29进货列表中' : '添加失败');
      return;
    }
    toast.success(`已将 ${selectedUser.nickname || selectedUser.phone} 加入9:29进货资格`);
    setShowAdd(false);
    setPhoneSearch('');
    setUserResults([]);
    setSelectedUser(null);
    setNotes('');
    load();
  }

  async function handleRemove(row: AccessRow) {
    const { error } = await supabase.from('rush_early_access').delete().eq('id', row.id);
    if (error) { toast.error('移除失败'); return; }
    toast.success('已移除进货资格');
    load();
  }

  const filtered = list.filter(r =>
    !search || r.user?.phone?.includes(search) || r.user?.nickname?.includes(search)
  );

  const usedCount = list.filter(r => r.is_used).length;
  const unusedCount = list.filter(r => !r.is_used).length;

  return (
    <AdminLayout>
      <PageHeader
        title="9:29 早场进货资格"
        description="体验商家/正式商家均可参与9:29早场进货，每人当日最多抢2单；此列表用于手动管理额外开放资格"
      />

      {/* 统计卡 */}
      <div className="grid grid-cols-3 gap-4 mb-6 max-w-lg">
        {[
          { label: '总资格数', value: list.length, icon: Users, color: 'text-primary' },
          { label: '待使用', value: unusedCount, icon: Clock, color: 'text-yellow-500' },
          { label: '已使用', value: usedCount, icon: CheckCircle2, color: 'text-green-500' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-sm p-4 flex items-center gap-3">
              <Icon size={20} className={s.color} />
              <div>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索手机号/昵称"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowAdd(true)}>
          <Plus size={14} />手动添加
        </Button>
      </div>

      {/* 列表 */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {['用户', '商家类型', '添加时间', '备注', '状态', '操作'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">加载中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">暂无数据</td></tr>
            ) : filtered.map(row => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{row.user?.nickname ?? '-'}</p>
                  <p className="text-xs text-muted-foreground">{row.user?.phone ?? row.user_id}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={row.user?.merchant_type === 'trial' ? 'secondary' : 'default'} className="text-xs">
                    {row.user?.merchant_type === 'trial' ? '体验商家' : '正式商家'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.added_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">
                  {row.notes ?? '-'}
                </td>
                <td className="px-4 py-3">
                  {row.is_used ? (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                      已使用 {row.used_at ? new Date(row.used_at).toLocaleDateString('zh-CN') : ''}
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-yellow-500/10 text-yellow-700 border-yellow-300">待使用</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemove(row)}
                    disabled={row.is_used}
                    title={row.is_used ? '已使用，不可移除' : '移除资格'}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 添加弹窗 */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>手动添加9:29进货资格</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">搜索用户手机号</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入手机号关键词"
                  value={phoneSearch}
                  onChange={e => setPhoneSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={searchUser}>搜索</Button>
              </div>
            </div>

            {userResults.length > 0 && (
              <div className="border border-border rounded-sm divide-y divide-border max-h-40 overflow-y-auto">
                {userResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedUser(u); setUserResults([]); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 text-left ${selectedUser?.id === u.id ? 'bg-primary/10' : ''}`}
                  >
                    <span>{u.nickname || '无昵称'} <span className="text-muted-foreground">{u.phone}</span></span>
                    <Badge variant={u.merchant_type === 'trial' ? 'secondary' : 'default'} className="text-xs">
                      {u.merchant_type === 'trial' ? '体验' : '正式'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <div className="bg-primary/5 border border-primary/20 rounded-sm px-3 py-2 text-sm">
                已选择：<span className="font-medium">{selectedUser.nickname || selectedUser.phone}</span>
                <span className="text-muted-foreground ml-2">{selectedUser.phone}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">备注（可选）</Label>
              <Textarea
                placeholder="如：首次体验用户，客服推荐"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="text-sm resize-none h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>取消</Button>
            <Button size="sm" onClick={handleAdd} disabled={saving || !selectedUser}>
              {saving ? '添加中…' : '确认添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
