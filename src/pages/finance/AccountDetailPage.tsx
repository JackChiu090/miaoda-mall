import { useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import type { VirtualAccount, AccountTransaction, User } from '@/types/types';

const ACCOUNT_LABEL: Record<string, string> = {
  bonus: '奖金账户', balance: '余额账户', points: '代金券账户',
  coupon: '优惠券账户', promotion: '推广奖金账户',
};

const TYPE_LABEL: Record<string, string> = {
  in: '收入', out: '支出', freeze: '冻结', unfreeze: '解冻',
};

export default function AccountDetailPage() {
  const [phone, setPhone] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    if (!phone.trim()) { toast.error('请输入手机号'); return; }
    setLoading(true);
    const { data: userData } = await supabase.from('users').select('*').eq('phone', phone.trim()).maybeSingle();
    if (!userData) { toast.error('未找到该用户'); setUser(null); setAccounts([]); setTransactions([]); setLoading(false); return; }
    setUser(userData);
    const [acRes, txRes] = await Promise.all([
      supabase.from('virtual_accounts').select('*').eq('user_id', userData.id).order('account_type'),
      supabase.from('account_transactions').select('*').eq('user_id', userData.id).order('created_at', { ascending: false }).limit(100),
    ]);
    setAccounts(Array.isArray(acRes.data) ? acRes.data : []);
    setTransactions(Array.isArray(txRes.data) ? txRes.data : []);
    setSelectedType('all');
    setLoading(false);
  }

  const filteredTx = selectedType === 'all' ? transactions : transactions.filter(t => t.account_type === selectedType);

  return (
    <AdminLayout>
      <PageHeader title="账户明细查询" description="按用户手机号查询五类虚拟账户余额与流水" />

      <div className="flex gap-2 mb-6 max-w-sm">
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="输入用户手机号"
          className="h-9 text-sm bg-muted border-border" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <Button onClick={handleSearch} disabled={loading} className="h-9 gap-1 shrink-0">
          <Search size={14} />{loading ? '查询中...' : '查询'}
        </Button>
      </div>

      {user && (
        <>
          <div className="flex items-center gap-3 mb-4 p-3 bg-card border border-border rounded-sm">
            <div>
              <p className="text-sm font-medium">{user.nickname || user.phone}</p>
              <p className="text-xs text-muted-foreground font-mono">{user.phone} · 邀请码：{user.invite_code}</p>
            </div>
          </div>

          {/* 账户余额卡 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
            {accounts.map(ac => (
              <div key={ac.id} className="bg-card border border-border rounded-sm p-3">
                <p className="text-xs text-muted-foreground mb-1">{ACCOUNT_LABEL[ac.account_type]}</p>
                <p className="text-sm font-medium text-foreground font-mono">¥{Number(ac.balance).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">累计入账 ¥{Number(ac.total_in).toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* 流水筛选 */}
          <div className="flex gap-1 mb-3 flex-wrap">
            {['all', 'bonus', 'balance', 'points', 'coupon', 'promotion'].map(type => (
              <button key={type} onClick={() => setSelectedType(type)}
                className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
                  selectedType === type
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}>
                {type === 'all' ? '全部流水' : ACCOUNT_LABEL[type]}
              </button>
            ))}
          </div>

          {/* 流水表格 */}
          <div className="bg-card border border-border rounded-sm overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['账户类型', '类型', '金额', '余额', '说明', '时间'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTx.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">暂无流水记录</td></tr>
                ) : filteredTx.map((tx, i) => (
                  <tr key={tx.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{ACCOUNT_LABEL[tx.account_type] ?? tx.account_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs ${tx.type === 'in' || tx.type === 'unfreeze' ? 'text-success' : 'text-destructive'}`}>
                        {TYPE_LABEL[tx.type]}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-xs whitespace-nowrap font-mono ${tx.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                      {tx.type === 'in' || tx.type === 'unfreeze' ? '+' : '-'}¥{Number(tx.amount).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap font-mono text-muted-foreground">
                      ¥{Number(tx.balance_after).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap max-w-40 truncate">{tx.description}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
