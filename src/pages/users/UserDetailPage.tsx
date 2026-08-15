// 用户全参数管理页：基本信息 / 安全 / 推荐关系 / 资金账户
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ArrowLeft, User as UserIcon, Lock, GitBranch,
  Wallet, Plus, Minus, RefreshCw,
} from 'lucide-react';
import type { User, VirtualAccount } from '@/types/types';
import { validateUserPassword } from '@/lib/passwordPolicy';

// 账户类型展示名（balance 余额账户已移除，不在系统中展示）
const ACCOUNT_LABELS: Record<string, string> = {
  points: '兑换代金券',
  coupon: '优惠券余额',
  bonus: '我的奖金',
  promotion: '推广奖金',
};

interface ReferrerInfo { id: string; phone: string; nickname: string }

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null);
  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // 基本信息 form
  const [basicForm, setBasicForm] = useState({ nickname: '', phone: '', member_level: '', merchant_type: '', kyc_status: '' });
  const [savingBasic, setSavingBasic] = useState(false);

  // 密码 form
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // 推荐关系 form
  const [referrerSearch, setReferrerSearch] = useState('');
  const [referrerResults, setReferrerResults] = useState<ReferrerInfo[]>([]);
  const [newReferrer, setNewReferrer] = useState<ReferrerInfo | null>(null);
  const [savingRef, setSavingRef] = useState(false);

  // 资金调整 form
  const [adjustTarget, setAdjustTarget] = useState<VirtualAccount | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustDir, setAdjustDir] = useState<'in' | 'out'>('in');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdj, setSavingAdj] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: u }, { data: accs }] = await Promise.all([
      supabase.from('users').select('*').eq('id', id).single(),
      supabase.from('user_accounts').select('*').eq('user_id', id),
    ]);
    if (!u) { toast.error('用户不存在'); navigate('/users'); return; }
    setUser(u as User);
    setBasicForm({
      nickname: u.nickname ?? '',
      phone: u.phone ?? '',
      member_level: u.member_level ?? 'normal',
      merchant_type: u.merchant_type ?? 'trial',
      kyc_status: u.kyc_status ?? 'unsubmitted',
    });
    setAccounts((accs as VirtualAccount[]) ?? []);
    if (u.referrer_id) {
      const { data: ref } = await supabase.from('users').select('id,phone,nickname').eq('id', u.referrer_id).maybeSingle();
      setReferrer(ref as ReferrerInfo | null);
    } else {
      setReferrer(null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  // ── 保存基本信息 ──
  async function saveBasic() {
    if (!user) return;
    setSavingBasic(true);
    const { error } = await supabase.from('users').update({
      nickname: basicForm.nickname,
      phone: basicForm.phone,
      member_level: basicForm.member_level,
      merchant_type: basicForm.merchant_type,
      kyc_status: basicForm.kyc_status,
    }).eq('id', user.id);
    setSavingBasic(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('基本信息已更新');
    load();
  }

  // ── 修改密码 ──
  async function savePwd() {
    if (!user) return;
    const pwdErr = validateUserPassword(newPwd);
    if (pwdErr) { toast.error(pwdErr); return; }
    setSavingPwd(true);
    const { error } = await supabase.from('users').update({ password: newPwd }).eq('id', user.id);
    setSavingPwd(false);
    if (error) { toast.error('修改失败'); return; }
    toast.success('密码已修改');
    setNewPwd('');
  }

  // ── 搜索推荐人 ──
  async function searchReferrer() {
    if (!referrerSearch.trim()) return;
    const { data } = await supabase.from('users').select('id,phone,nickname')
      .or(`phone.ilike.%${referrerSearch}%,nickname.ilike.%${referrerSearch}%`)
      .neq('id', id!)
      .limit(8);
    setReferrerResults((data as ReferrerInfo[]) ?? []);
  }

  // ── 保存推荐关系 ──
  async function saveReferrer() {
    if (!user) return;
    setSavingRef(true);
    const { error } = await supabase.from('users').update({ referrer_id: newReferrer?.id ?? null }).eq('id', user.id);
    setSavingRef(false);
    if (error) { toast.error('修改失败'); return; }
    toast.success(newReferrer ? `推荐人已更新为 ${newReferrer.nickname || newReferrer.phone}` : '推荐关系已清除');
    setReferrer(newReferrer);
    setNewReferrer(null);
    setReferrerSearch('');
    setReferrerResults([]);
  }

  // ── 调整账户余额 ──
  async function saveAdjust() {
    if (!adjustTarget || !adjustDelta) { toast.error('请填写调整金额'); return; }
    const delta = parseFloat(adjustDelta);
    if (isNaN(delta) || delta <= 0) { toast.error('请输入正数金额'); return; }
    setSavingAdj(true);
    const newBalance = adjustDir === 'in'
      ? adjustTarget.balance + delta
      : Math.max(0, adjustTarget.balance - delta);
    // user_accounts 是视图，UPDATE 需直接操作底层 virtual_accounts 表
    const { error } = await supabase.from('virtual_accounts')
      .update({ balance: newBalance })
      .eq('id', adjustTarget.id);
    if (!error) {
      // 插入流水记录
      await supabase.from('account_transactions').insert({
        account_id: adjustTarget.id,
        user_id: adjustTarget.user_id,
        account_type: adjustTarget.account_type,
        type: adjustDir,
        amount: delta,
        balance_after: newBalance,
        description: adjustReason || `管理员${adjustDir === 'in' ? '增加' : '扣减'}`,
      });
    }
    setSavingAdj(false);
    if (error) { toast.error('调整失败：' + error.message); return; }
    toast.success(`已${adjustDir === 'in' ? '增加' : '扣减'} ${delta} ${ACCOUNT_LABELS[adjustTarget.account_type] ?? ''}`);
    setAdjustTarget(null);
    setAdjustDelta('');
    setAdjustReason('');
    load();
  }

  if (loading) return (
    <AdminLayout>
      <div className="space-y-3 max-w-2xl">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </AdminLayout>
  );

  if (!user) return null;

  return (
    <AdminLayout>
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')}
          className="h-7 px-2 text-xs border border-border gap-1">
          <ArrowLeft size={12} />返回列表
        </Button>
        <h1 className="text-sm font-semibold text-foreground">{user.nickname || user.phone} 的账号管理</h1>
        {user.is_banned && <Badge variant="destructive" className="text-xs">已封禁</Badge>}
      </div>

      {/* 概览卡 */}
      <div className="bg-card border border-border rounded-sm p-4 mb-5 flex flex-wrap gap-4 text-xs">
        <div><span className="text-muted-foreground">手机号</span><p className="font-mono font-medium mt-0.5">{user.phone}</p></div>
        <div><span className="text-muted-foreground">用户ID</span><p className="font-mono text-muted-foreground mt-0.5 max-w-[160px] truncate">{user.id}</p></div>
        <div><span className="text-muted-foreground">邀请码</span><p className="font-mono font-medium mt-0.5">{user.invite_code}</p></div>
        <div><span className="text-muted-foreground">注册时间</span><p className="mt-0.5">{new Date(user.created_at).toLocaleString('zh-CN')}</p></div>
      </div>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="h-8 text-xs">
          <TabsTrigger value="basic" className="gap-1 text-xs h-7"><UserIcon size={12} />基本信息</TabsTrigger>
          <TabsTrigger value="security" className="gap-1 text-xs h-7"><Lock size={12} />安全</TabsTrigger>
          <TabsTrigger value="referrer" className="gap-1 text-xs h-7"><GitBranch size={12} />推荐关系</TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1 text-xs h-7"><Wallet size={12} />资金账户</TabsTrigger>
        </TabsList>

        {/* ── 基本信息 ── */}
        <TabsContent value="basic">
          <div className="bg-card border border-border rounded-sm p-5 max-w-xl space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">昵称</Label>
                <Input value={basicForm.nickname} onChange={e => setBasicForm(f => ({ ...f, nickname: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">手机号</Label>
                <Input value={basicForm.phone} onChange={e => setBasicForm(f => ({ ...f, phone: e.target.value }))}
                  className="h-8 text-xs bg-muted border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">会员等级</Label>
                <Select value={basicForm.member_level} onValueChange={v => setBasicForm(f => ({ ...f, member_level: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">普通用户</SelectItem>
                    <SelectItem value="member">会员</SelectItem>
                    <SelectItem value="captain">团长</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">商家类型</Label>
                <Select value={basicForm.merchant_type} onValueChange={v => setBasicForm(f => ({ ...f, merchant_type: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">体验商家</SelectItem>
                    <SelectItem value="regular">正式商家</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">实名认证状态</Label>
                <Select value={basicForm.kyc_status} onValueChange={v => setBasicForm(f => ({ ...f, kyc_status: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unsubmitted">未提交</SelectItem>
                    <SelectItem value="pending">待审核</SelectItem>
                    <SelectItem value="approved">已认证</SelectItem>
                    <SelectItem value="rejected">已拒绝</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={saveBasic} disabled={savingBasic} className="h-7 px-4 text-xs gap-1">
                {savingBasic ? <><RefreshCw size={11} className="animate-spin" />保存中</> : '保存修改'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── 安全：修改密码 ── */}
        <TabsContent value="security">
          <div className="bg-card border border-border rounded-sm p-5 max-w-sm space-y-4">
            <p className="text-xs text-muted-foreground">直接设置用户新密码（明文存储，与系统一致）</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">新密码（至少6位）</Label>
              <Input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="输入新密码" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={savePwd} disabled={savingPwd} className="h-7 px-4 text-xs gap-1">
                {savingPwd ? <><RefreshCw size={11} className="animate-spin" />保存中</> : '修改密码'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── 推荐关系 ── */}
        <TabsContent value="referrer">
          <div className="bg-card border border-border rounded-sm p-5 max-w-md space-y-4">
            {/* 当前推荐人 */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">当前推荐人</p>
              {referrer ? (
                <div className="bg-muted/40 border border-border rounded-sm px-3 py-2 text-xs flex items-center justify-between">
                  <span className="font-medium">{referrer.nickname || '无昵称'}</span>
                  <span className="text-muted-foreground">{referrer.phone}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">暂无推荐人</p>
              )}
            </div>

            {/* 修改推荐人 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">搜索新推荐人</Label>
              <div className="flex gap-2">
                <Input placeholder="手机号 / 昵称" value={referrerSearch}
                  onChange={e => setReferrerSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchReferrer()}
                  className="h-8 text-xs bg-muted border-border flex-1" />
                <Button size="sm" variant="outline" onClick={searchReferrer} className="h-8 text-xs shrink-0">搜索</Button>
              </div>
              {referrerResults.length > 0 && (
                <div className="border border-border rounded-sm divide-y divide-border max-h-36 overflow-y-auto">
                  {referrerResults.map(r => (
                    <button key={r.id} onClick={() => { setNewReferrer(r); setReferrerResults([]); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 text-left">
                      <span className="font-medium">{r.nickname || '无昵称'}</span>
                      <span className="text-muted-foreground">{r.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {newReferrer && (
                <div className="bg-primary/5 border border-primary/20 rounded-sm px-3 py-2 text-xs flex items-center justify-between">
                  <span>新推荐人：<span className="font-medium">{newReferrer.nickname || newReferrer.phone}</span></span>
                  <button onClick={() => setNewReferrer(null)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setNewReferrer(null); setSavingRef(false); }}
                className="h-7 text-xs border-border">清除推荐人</Button>
              <Button size="sm" onClick={saveReferrer} disabled={savingRef || (!newReferrer && !!referrer)}
                className="h-7 px-4 text-xs">
                {savingRef ? <><RefreshCw size={11} className="animate-spin mr-1" />保存中</> : '保存推荐关系'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── 资金账户 ── */}
        <TabsContent value="accounts">
          <div className="space-y-3 max-w-2xl">
            {/* 账户卡片列表 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {accounts.filter(acc => acc.account_type !== 'balance').length === 0 ? (
                <p className="text-xs text-muted-foreground col-span-3">暂无账户数据</p>
              ) : accounts.filter(acc => acc.account_type !== 'balance').map(acc => (
                <div key={acc.id}
                  className={`bg-card border rounded-sm p-3 cursor-pointer transition-colors ${adjustTarget?.id === acc.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                  onClick={() => { setAdjustTarget(acc); setAdjustDelta(''); setAdjustReason(''); }}>
                  <p className="text-xs text-muted-foreground">{ACCOUNT_LABELS[acc.account_type] ?? acc.account_type}</p>
                  <p className="text-xl font-bold text-foreground mt-1">{acc.balance.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">累计入 {acc.total_in} · 累计出 {acc.total_out}</p>
                </div>
              ))}
            </div>

            {/* 调整面板 */}
            {adjustTarget && (
              <div className="bg-card border border-primary/30 rounded-sm p-4 space-y-3">
                <p className="text-xs font-medium text-foreground">
                  调整：{ACCOUNT_LABELS[adjustTarget.account_type] ?? adjustTarget.account_type}
                  <span className="text-muted-foreground ml-2">当前余额 {adjustTarget.balance.toLocaleString()}</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant={adjustDir === 'in' ? 'default' : 'outline'}
                    onClick={() => setAdjustDir('in')} className="h-7 text-xs gap-1 flex-1">
                    <Plus size={11} />增加
                  </Button>
                  <Button size="sm" variant={adjustDir === 'out' ? 'default' : 'outline'}
                    onClick={() => setAdjustDir('out')} className="h-7 text-xs gap-1 flex-1">
                    <Minus size={11} />扣减
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">调整数量</Label>
                    <Input type="number" min={1} value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                      placeholder="输入数量" className="h-8 text-xs bg-muted border-border" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">备注原因</Label>
                    <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                      placeholder="（可选）" className="h-8 text-xs bg-muted border-border" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setAdjustTarget(null)} className="h-7 text-xs border-border">取消</Button>
                  <Button size="sm" onClick={saveAdjust} disabled={savingAdj} className="h-7 px-4 text-xs gap-1">
                    {savingAdj ? <><RefreshCw size={11} className="animate-spin" />处理中</> : '确认调整'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
