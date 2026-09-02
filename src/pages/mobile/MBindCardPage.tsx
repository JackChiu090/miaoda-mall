import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Plus } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';
import { useSubmitLock } from '@/hooks/use-submit-lock';

interface BankCard { id: string; bank_name: string; account_no: string; account_name: string; is_default: boolean; created_at: string; }

export default function MBindCardPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [cards, setCards] = useState<BankCard[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [bankName, setBankName] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [holderName, setHolderName] = useState('');
  const { tryLock, unlock, isPending } = useSubmitLock();
  const loading = isPending('bind');

  const loadCards = () => {
    if (!mobileUser) return;
    supabase.from('payment_accounts').select('*').eq('user_id', mobileUser.id).eq('account_type', 'bank').order('created_at')
      .then(({ data }) => setCards(data ?? []));
  };

  useEffect(() => { loadCards(); }, [mobileUser?.id]);

  const handleBind = async () => {
    if (!bankName) { toast.error('请选择银行'); return; }
    if (!/^\d{16,19}$/.test(cardNo.replace(/\s/g, ''))) { toast.error('请输入正确的银行卡号'); return; }
    if (!holderName.trim()) { toast.error('请输入持卡人姓名'); return; }
    if (!tryLock('bind')) return;
    try {
      const { error } = await supabase.from('payment_accounts').insert({
        user_id: mobileUser!.id,
        account_type: 'bank',
        bank_name: bankName,
        account_no: cardNo.replace(/\s/g, ''),
        account_name: holderName.trim(),
        is_default: cards.length === 0,
      });
      if (error) { toast.error('绑定失败，请重试'); return; }
      toast.success('银行卡绑定成功');
      setBankName(''); setCardNo(''); setHolderName(''); setShowForm(false);
      loadCards();
    } finally {
      unlock('bind');
    }
  };

  const BANKS = ['中国工商银行', '中国建设银行', '中国农业银行', '中国银行', '交通银行', '招商银行', '浦发银行', '兴业银行', '中信银行', '光大银行', '民生银行', '平安银行'];

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="绑定银行卡" back />

      <div className="px-4 py-4 space-y-3">
        {/* 已绑定卡列表 */}
        {cards.map(card => (
          <div key={card.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <CreditCard size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{card.bank_name}</p>
              <p className="text-xs text-muted-foreground">****{card.account_no.slice(-4)}  {card.account_name}</p>
            </div>
            {card.is_default && (
              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">默认</span>
            )}
          </div>
        ))}

        {/* 添加卡 */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full border-2 border-dashed border-border rounded-xl py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Plus size={16} />添加新银行卡
          </button>
        ) : (
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">添加银行卡</h3>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">开户银行</label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger className="h-11"><SelectValue placeholder="请选择银行" /></SelectTrigger>
                <SelectContent>{BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">银行卡号</label>
              <Input placeholder="请输入银行卡号" className="h-11 font-mono" value={cardNo} onChange={e => setCardNo(e.target.value)} maxLength={19} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">持卡人姓名</label>
              <Input placeholder="请输入持卡人真实姓名" className="h-11" value={holderName} onChange={e => setHolderName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setShowForm(false)}>取消</Button>
              <Button className="flex-1 h-11" onClick={handleBind} disabled={loading}>{loading ? '绑定中...' : '确认绑定'}</Button>
            </div>
          </div>
        )}

        <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground">
          绑定银行卡用于提现操作，平台仅用于显示，不存储完整卡号
        </div>
      </div>
    </div>
  );
}
