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
import { Pencil, Check, Plus } from 'lucide-react';
import type { PlatformAgreement } from '@/types/types';

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState<PlatformAgreement[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAgreement | null>(null);
  const [form, setForm] = useState({ title: '', content: '', version: '', code: '' });
  const [preview, setPreview] = useState<PlatformAgreement | null>(null);

  async function fetchAgreements() {
    setLoading(true);
    const { data } = await supabase.from('platform_agreements').select('*').order('code');
    setAgreements(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchAgreements(); }, []);

  function openEdit(ag: PlatformAgreement) {
    setEditing(ag);
    setForm({ title: ag.title, content: ag.content, version: ag.version, code: ag.code });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', content: '', version: 'v1.0', code: '' });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title || !form.content) { toast.error('请填写标题和内容'); return; }
    const newVersion = form.version || `v${Date.now()}`;
    if (editing) {
      const { error } = await supabase.from('platform_agreements').update({
        title: form.title, content: form.content, version: newVersion,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      if (error) { toast.error('更新失败'); return; }
      toast.success('协议已更新');
    } else {
      if (!form.code) { toast.error('请填写协议代码（英文唯一标识）'); return; }
      const { error } = await supabase.from('platform_agreements').insert({
        code: form.code, title: form.title, content: form.content,
        version: newVersion, is_active: true, updated_at: new Date().toISOString(),
      });
      if (error) { toast.error('新增失败：' + error.message); return; }
      toast.success('协议已新增');
    }
    setDialogOpen(false);
    fetchAgreements();
  }

  async function handleToggleActive(ag: PlatformAgreement) {
    await supabase.from('platform_agreements').update({ is_active: !ag.is_active }).eq('id', ag.id);
    toast.success(ag.is_active ? '已禁用协议' : '已启用协议');
    fetchAgreements();
  }

  const CODE_LABEL: Record<string, string> = {
    register_agreement:  '注册协议',
    privacy_policy:      '隐私协议',
    user_notice:         '用户须知',
    c2c_payment_risk:    'C2C支付风险须知',
    entrust_service:     '委托服务协议',
    sign_agreement:      '签约协议',
    user_agreement:      '用户协议',
    consignment_rules:   '寄卖规则',
    distribution_agreement: '分销协议',
  };

  return (
    <AdminLayout>
      <PageHeader title="平台协议管理" description="管理平台各类用户协议与规则文档"
        action={
          <Button size="sm" onClick={openCreate} className="h-8 px-3 text-xs gap-1.5">
            <Plus size={13} />新增协议
          </Button>
        }
      />

      <div className="grid gap-3">
        {loading ? (
          <p className="text-xs text-muted-foreground py-8 text-center">加载中...</p>
        ) : agreements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">暂无协议，点击右上角新增</div>
        ) : agreements.map(ag => (
          <div key={ag.id} className="bg-card border border-border rounded-sm p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-medium text-foreground">{ag.title}</span>
                <span className="text-xs font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">
                  {CODE_LABEL[ag.code] ?? ag.code}
                </span>
                <span className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">
                  {ag.version}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 text-pretty">{ag.content.slice(0, 120)}...</p>
              <p className="text-xs text-muted-foreground mt-1">
                更新于 {new Date(ag.updated_at).toLocaleDateString('zh-CN')}
                {ag.is_active ? (
                  <span className="ml-2 text-success inline-flex items-center gap-0.5"><Check size={11} />生效中</span>
                ) : (
                  <span className="ml-2 text-muted-foreground">未启用</span>
                )}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setPreview(ag)}
                className="h-7 px-2 text-xs border border-border">预览</Button>
              <Button variant="ghost" size="sm" onClick={() => openEdit(ag)}
                className="h-7 w-7 p-0 border border-border">
                <Pencil size={11} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleToggleActive(ag)}
                className="h-7 px-2 text-xs border border-border text-muted-foreground">
                {ag.is_active ? '禁用' : '启用'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑/新增对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">{editing ? `编辑协议：${editing.title}` : '新增协议'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">协议标题</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">版本号</Label>
                <Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                  placeholder="如：v2.0" className="h-8 text-xs bg-muted border-border" />
              </div>
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">协议代码（英文唯一标识，如 privacy_policy）</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="英文字母+下划线" className="h-8 text-xs bg-muted border-border font-mono" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">协议内容</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                className="text-xs bg-muted border-border resize-none min-h-64 font-mono" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 预览对话框 */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">{preview?.title} — {preview?.version}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{preview?.content}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
