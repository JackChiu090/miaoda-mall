import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { MemberLevel } from '@/types/types';

export default function MemberLevelsPage() {
  const [levels, setLevels] = useState<MemberLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemberLevel | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', min_direct_referrals: 0, min_team_depth: 0, sort_order: 0 });

  async function fetchLevels() {
    setLoading(true);
    const { data } = await supabase.from('member_levels').select('*').order('sort_order', { ascending: true });
    setLevels(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchLevels(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', description: '', min_direct_referrals: 0, min_team_depth: 0, sort_order: 0 });
    setDialogOpen(true);
  }

  function openEdit(level: MemberLevel) {
    setEditing(level);
    setForm({
      code: level.code, name: level.name, description: level.description ?? '',
      min_direct_referrals: level.min_direct_referrals,
      min_team_depth: level.min_team_depth,
      sort_order: level.sort_order,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.code || !form.name) { toast.error('请填写等级标识和名称'); return; }
    if (editing) {
      const { error } = await supabase.from('member_levels').update(form).eq('id', editing.id);
      if (error) { toast.error('更新失败'); return; }
      toast.success('等级更新成功');
    } else {
      const { error } = await supabase.from('member_levels').insert(form);
      if (error) { toast.error('创建失败：' + error.message); return; }
      toast.success('等级创建成功');
    }
    setDialogOpen(false);
    fetchLevels();
  }

  async function handleDelete(level: MemberLevel) {
    if (['normal', 'member', 'captain'].includes(level.code)) {
      toast.error('系统默认等级不可删除');
      return;
    }
    const { error } = await supabase.from('member_levels').delete().eq('id', level.id);
    if (error) { toast.error('删除失败'); return; }
    toast.success('已删除');
    fetchLevels();
  }

  return (
    <AdminLayout>
      <PageHeader title="会员/团长等级管理"
        action={<Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1"><Plus size={13} />新建等级</Button>} />

      <div className="grid gap-3">
        {loading ? (
          <p className="text-xs text-muted-foreground py-8 text-center">加载中...</p>
        ) : levels.map(level => (
          <div key={level.id} className="bg-card border border-border rounded-sm p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">{level.name}</span>
                <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">{level.code}</span>
              </div>
              {level.description && <p className="text-xs text-muted-foreground mb-2">{level.description}</p>}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>直推要求：<span className="text-foreground">{level.min_direct_referrals} 人</span></span>
                <span>团队层级：<span className="text-foreground">{level.min_team_depth} 层</span></span>
                <span>排序：<span className="text-foreground">{level.sort_order}</span></span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => openEdit(level)} className="h-7 w-7 p-0 border border-border">
                <Pencil size={12} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(level)}
                className="h-7 w-7 p-0 border border-destructive/30 text-destructive hover:bg-destructive/10">
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">{editing ? '编辑等级' : '新建等级'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">等级标识</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="如：vip" className="h-8 text-xs bg-muted border-border" disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">等级名称</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="如：VIP会员" className="h-8 text-xs bg-muted border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">说明</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="等级说明" className="text-xs bg-muted border-border resize-none min-h-16" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">最少直推人数</Label>
                <Input type="number" min={0} value={form.min_direct_referrals}
                  onChange={e => setForm(f => ({ ...f, min_direct_referrals: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">最少团队层级</Label>
                <Input type="number" min={0} value={form.min_team_depth}
                  onChange={e => setForm(f => ({ ...f, min_team_depth: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">排序</Label>
                <Input type="number" min={0} value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
