// 测试数据清除工具：一键清除测试业务数据，保留老板账号与系统配置（仅超级管理员）
import { useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, ShieldCheck, Database, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClearResult {
  success: boolean;
  boss_preserved: number;
  summary: { table: string; cleared: number }[];
  total_cleared: number;
  error?: string;
}

const CLEAR_SCOPE = [
  '测试订单及订单状态日志',
  '测试商品（寄卖/手动添加）',
  '虚拟账户与资金流水',
  '分销关系与奖金记录',
  '实名认证与考核记录',
  '吃土筛选与淘汰记录',
  '拆单与拆人记录',
  '转拍、提现、优惠券领取记录',
  '早市激励奖励发放记录',
  '非老板测试用户账号',
];

const PRESERVE_SCOPE = [
  '老板账号及其权限配置',
  '管理员账号',
  '数据库表结构与核心业务逻辑代码',
  '系统配置参数',
  '商品分类、抢购时段、激励配置',
  '活动、公告、Banner 等运营配置',
];

export default function ClearTestDataPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClearResult | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const handleClear = async () => {
    if (confirmText.trim() !== '确认清除') {
      toast.error('请输入"确认清除"以二次确认');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('clear-test-data', {});
      if (error) {
        const msg = await error?.context?.text?.().catch(() => '');
        throw new Error(msg || error.message || '清除失败');
      }
      if (data?.error) throw new Error(data.error);
      setResult(data as ClearResult);
      toast.success('测试数据已清除');
      setConfirmText('');
    } catch (e) {
      toast.error(`清除失败：${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <PageHeader title="测试数据清除工具" description="一键清除测试生成的业务数据，保留老板账号与系统配置，清除后可直接投入正式运营" />

        {/* 危险提示 */}
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-foreground">
              <p className="font-semibold text-destructive mb-1">高危操作，不可逆</p>
              <p className="text-muted-foreground">此操作将永久删除所有测试业务数据，且无法恢复。执行前请务必确认已备份必要数据，并仔细核对清除范围。</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 清除范围 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trash2 size={16} className="text-destructive" /> 将被清除
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {CLEAR_SCOPE.map(s => (
                  <li key={s} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* 保留范围 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck size={16} className="text-primary" /> 将被保留
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {PRESERVE_SCOPE.map(s => (
                  <li key={s} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* 执行区 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database size={16} /> 执行清除
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>二次确认</Label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder='请输入"确认清除"四个字'
              />
              <p className="text-xs text-muted-foreground">为防止误操作，请手动输入上述文字以启用清除按钮</p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={loading || confirmText.trim() !== '确认清除'}>
                  {loading ? <Loader2 size={16} className="animate-spin mr-1" /> : <Trash2 size={16} className="mr-1" />}
                  一键清除测试数据
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>确认清除全部测试数据？</AlertDialogTitle>
                  <AlertDialogDescription>
                    此操作不可逆，将永久删除所有测试订单、商品、用户及资金流水等业务数据。老板账号与系统配置将被保留。确定继续吗？
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    确认清除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* 清除结果 */}
        {result && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 size={16} className="text-primary" /> 清除完成
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                共清除 <span className="font-bold text-foreground">{result.total_cleared}</span> 条测试数据，
                老板账号已保留 <span className="font-bold text-foreground">{result.boss_preserved}</span> 个。
              </p>
              {result.summary.length > 0 && (
                <div className="rounded-lg border border-border bg-background overflow-hidden">
                  <div className="grid grid-cols-2 gap-px bg-border text-xs">
                    {result.summary.map(r => (
                      <div key={r.table} className="bg-background px-3 py-2 flex items-center justify-between">
                        <span className="text-muted-foreground truncate">{r.table}</span>
                        <span className="font-medium text-foreground ml-2 shrink-0">-{r.cleared}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}