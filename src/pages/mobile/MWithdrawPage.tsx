import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, Clock } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

interface WithdrawRecord { id: string; amount: number; status: string; created_at: string; bank_name: string; bank_account: string; }
interface BankCard { id: string; bank_name: string; account_no: string; account_name: string; }
interface Account { account_type: string; balance: number; }

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: '审核中', variant: 'default' },
  approved: { label: '已通过', variant: 'secondary' },
  rejected: { label: '已拒绝', variant: 'destructive' },
  paid: { label: '已打款', variant: 'secondary' },
};

// 各账户提现/转入规则：
// - 余额账户：绑定收款账户后可提现，不可转入代金券账户
// - 奖金账户：不可转入余额账户，不可提现（只有推广账户可提现）
// - 推广奖金账户：独立核算，不可提现
// - 代金券账户：不可提现，仅消费抵扣
// - 优惠券账户：仅消费抵扣，无有效期，不可提现
// 可提现账户：仅 balance（余额账户）
const ACCOUNT_OPTIONS = [
  { value: 'balance', label: '余额账户', canWithdraw: true },
];

// 账户规则说明（用于 UI 展示）
const ACCOUNT_RULES: Record<string, string> = {
  balance:   '绑定收款账户后可提现，不可转入代金券账户',
  bonus:     '不可转入余额账户，不可提现',
  promotion: '独立核算，不可提现',
  points:    '不可提现，仅用于消费抵扣',
  coupon:    '仅消费抵扣，无有效期，不可提现',
};

export default function MWithdrawPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<BankCard[]>([]);
  const [cardId, setCardId] = useState('');
  const [accountType, setAccountType] = useState('balance');
  const [amount, setAmount] = useState('');
  const [records, setRecords] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    Promise.all([
      supabase.from('user_accounts').select('account_type,balance').eq('user_id', mobileUser.id).in('account_type', ['balance', 'bonus', 'promotion', 'points', 'coupon']),
      supabase.from('payment_accounts').select('id,bank_name,account_no,account_name').eq('user_id', mobileUser.id).eq('account_type', 'bank'),
      supabase.from('withdrawal_requests').select('id,amount,status,created_at,bank_name,bank_account').eq('user_id', mobileUser.id).order('created_at', { ascending: false }).limit(10),
    ]).then(([accs, cds, recs]) => {
      setAccounts((accs.data as Account[]) ?? []);
      const cardList = cds.data ?? [];
      setCards(cardList);
      if (cardList.length > 0) setCardId(cardList[0].id);
      setRecords((recs.data as WithdrawRecord[]) ?? []);
      setLoading(false);
    });
  }, [mobileUser?.id]);

  const currentBalance = accounts.find(a => a.account_type === accountType)?.balance ?? 0;

  const handleWithdraw = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 10) { toast.error('最低提现金额为 ¥10'); return; }
    if (val > currentBalance) { toast.error('余额不足'); return; }
    // 仅余额账户（balance）可提现
    const opt = ACCOUNT_OPTIONS.find(o => o.value === accountType);
    if (!opt?.canWithdraw) { toast.error('该账户不支持提现'); return; }
    if (!cardId) { toast.error('请先绑定银行卡'); navigate('/m/bind-card'); return; }
    const card = cards.find(c => c.id === cardId);
    setSubmitting(true);
    const { error } = await supabase.from('withdrawal_requests').insert({
      user_id: mobileUser!.id,
      account_type: accountType,
      amount: val,
      bank_name: card?.bank_name,
      bank_account: card?.account_no,
      bank_holder: card?.account_name,
    });
    setSubmitting(false);
    if (error) { toast.error('提交失败，请重试'); return; }
    toast.success('提现申请已提交，1-3个工作日内到账');
    setAmount('');
    supabase.from('user_accounts').select('account_type,balance').eq('user_id', mobileUser!.id).in('account_type', ['balance', 'bonus', 'promotion', 'points', 'coupon'])
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="申请提现" back />

      <div className="px-4 py-4 space-y-4">
        {/* 账户余额总览 */}
        <div className="bg-primary px-4 py-5 rounded-xl">
          <p className="text-primary-foreground/80 text-xs mb-3">账户余额总览</p>
          {loading ? (
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 bg-white/20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'balance',   label: '余额账户',   canWithdraw: true },
                { key: 'bonus',     label: '奖金账户',   canWithdraw: false },
                { key: 'promotion', label: '推广账户',   canWithdraw: false },
                { key: 'points',    label: '代金券账户', canWithdraw: false },
                { key: 'coupon',    label: '优惠券账户', canWithdraw: false },
              ].map(opt => {
                const bal = accounts.find(a => a.account_type === opt.key)?.balance ?? 0;
                const isSelected = accountType === opt.key && opt.canWithdraw;
                return (
                  <button
                    key={opt.key}
                    onClick={() => { if (opt.canWithdraw) { setAccountType(opt.key); setAmount(''); } }}
                    disabled={!opt.canWithdraw}
                    className={`rounded-lg px-2 py-2 text-left transition-all border ${
                      isSelected ? 'bg-white/30 border-white/60' :
                      opt.canWithdraw ? 'bg-white/10 border-white/20 hover:bg-white/20' :
                      'bg-white/5 border-white/10 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <p className="text-[10px] text-primary-foreground/80 mb-0.5 flex items-center gap-1">
                      {opt.label}
                      {!opt.canWithdraw && <span className="text-[9px] text-white/40">不可提现</span>}
                    </p>
                    <p className="text-sm font-bold text-white">¥{bal.toFixed(2)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 账户规则说明 */}
        <div className="bg-muted/40 border border-border rounded-xl px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-foreground mb-2">账户规则说明</p>
          {Object.entries(ACCOUNT_RULES).map(([key, rule]) => (
            <p key={key} className="text-xs text-muted-foreground flex gap-1.5">
              <span className={`shrink-0 font-medium ${key === 'balance' ? 'text-primary' : 'text-foreground/60'}`}>
                {key === 'balance' ? '余额账户' : key === 'bonus' ? '奖金账户' : key === 'promotion' ? '推广账户' : key === 'points' ? '代金券账户' : '优惠券账户'}：
              </span>
              {rule}
            </p>
          ))}
        </div>

        {/* 提现表单（仅余额账户） */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">余额账户提现</p>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              提现金额（可用：¥{currentBalance.toFixed(2)}）
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base">¥</span>
              <Input
                type="number"
                min={10}
                placeholder="最低 ¥10"
                className="pl-7 h-12 text-lg font-bold"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              <button onClick={() => setAmount(currentBalance.toFixed(2))} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary">全部</button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">到账银行卡</label>
            {cards.length === 0 ? (
              <Button variant="outline" className="w-full h-11" onClick={() => navigate('/m/bind-card')}>
                + 添加银行卡
              </Button>
            ) : (
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cards.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.bank_name} ****{c.account_no.slice(-4)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button className="w-full h-12 text-base" onClick={handleWithdraw} disabled={submitting || cards.length === 0}>
            <ArrowUpRight size={16} className="mr-2" />
            {submitting ? '提交中...' : '确认提现'}
          </Button>
        </div>

        {/* 提现记录 */}
        {records.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">提现记录</h3>
            <div className="space-y-2">
              {records.map(r => {
                const s = STATUS_MAP[r.status] ?? { label: r.status, variant: 'outline' as const };
                return (
                  <div key={r.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                    <Clock size={16} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">¥{r.amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{r.bank_name} ****{r.bank_account?.slice(-4)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('zh-CN')}</p>
                    </div>
                    <Badge variant={s.variant} className="text-xs shrink-0">{s.label}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
