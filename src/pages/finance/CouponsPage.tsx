import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { CouponTemplate } from '@/types/types';

export default function CouponsPage() {
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', face_value: '', min_amount: '0', valid_days: '30', total_count: '0' });
  const [issueDialog, setIssueDialog] = useState(false);
  const [issueTarget, setIssueTarget] = useState<CouponTemplate | null>(null);
  const [issuePhone, setIssuePhone] = useState('');

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase.from('coupon_templates').select('*').order('created_at', { ascending: false }).limit(50);
    setTemplates(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchTemplates(); }, []);

  async function handleCreate() {
    if (!form.name || !form.face_value) { toast.error('请填写优惠券名称和面额'); return; }
    const { error } = await supabase.from('coupon_templates').insert({
      name: form.name,
      face_value: parseFloat(form.face_value),
      min_amount: parseFloat(form.min_amount) || 0,
      valid_days: parseInt(form.valid_days) || 30,
      total_count: parseInt(form.total_count) || 0,
    });
    if (error) { toast.error('创建失败'); return; }
    toast.success('优惠券模板已创建');
    setDialogOpen(false);
    fetchTemplates();
  }

  async function handleIssue() {
    if (!issuePhone || !issueTarget) return;
    const { data: user } = await supabase.from('users').select('id').eq('phone', issuePhone).maybeSingle();
    if (!user) { toast.error('未找到该用户'); return; }
    const expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + issueTarget.valid_days);
    const { error } = await supabase.from('user_coupons').insert({
      user_id: user.id, template_id: issueTarget.id,
      face_value: issueTarget.face_value, expired_at: expiredAt.toISOString(),
    });
    if (error) { toast.error('发放失败'); return; }
    await supabase.from('coupon_templates').update({ issued_count: issueTarget.issued_count + 1 }).eq('id', issueTarget.id);
    toast.success('优惠券已发放');
    setIssueDialog(false);
    setIssuePhone('');
    fetchTemplates();
  }

  async function handleToggle(t: CouponTemplate) {
    await supabase.from('coupon_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    toast.success(t.is_active ? '已停用' : '已启用');
    fetchTemplates();
  }

  return (
    <AdminLayout>
      <PageHeader title="优惠券管理"
        action={<Button size="sm" onClick={() => { setForm({ name: '', face_value: '', min_amount: '0', valid_days: '30', total_count: '0' }); setDialogOpen(true); }} className="h-8 text-xs gap-1"><Plus size={13} />新建优惠券</Button>} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['优惠券名称', '面额', '使用门槛', '有效天数', '已发放/总量', '状态', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无优惠券</td></tr>
            ) : templates.map((t, i) => (
              <tr key={t.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium">{t.name}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-primary">¥{Number(t.face_value).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {Number(t.min_amount) > 0 ? `满¥${Number(t.min_amount).toFixed(0)}可用` : '无门槛'}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{t.valid_days} 天</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">{t.issued_count} / {t.total_count || '不限'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <StatusBadge status={t.is_active ? 'active' : 'withdrawn'} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setIssueTarget(t); setIssuePhone(''); setIssueDialog(true); }}
                      className="h-6 px-2 text-xs border border-accent/40 text-accent hover:bg-accent/10">
                      发放
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(t)}
                      className="h-6 px-2 text-xs border border-border text-muted-foreground">
                      {t.is_active ? '停用' : '启用'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新建对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">新建优惠券</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { key: 'name', label: '优惠券名称 *', placeholder: '如：新人专享券' },
              { key: 'face_value', label: '面额（元）*', placeholder: '10', type: 'number' },
              { key: 'min_amount', label: '使用门槛（元）', placeholder: '0 = 无门槛', type: 'number' },
              { key: 'valid_days', label: '有效天数', placeholder: '30', type: 'number' },
              { key: 'total_count', label: '发行总量（0=不限）', placeholder: '0', type: 'number' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                <Input type={f.type ?? 'text'} value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} className="h-8 text-xs bg-muted border-border" />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleCreate} className="h-7 px-3 text-xs">创建</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 发放对话框 */}
      <Dialog open={issueDialog} onOpenChange={setIssueDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">发放优惠券：{issueTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">收券用户手机号</Label>
              <Input value={issuePhone} onChange={e => setIssuePhone(e.target.value)}
                placeholder="13800000000" className="h-8 text-xs bg-muted border-border font-mono" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIssueDialog(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleIssue} className="h-7 px-3 text-xs">发放</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
