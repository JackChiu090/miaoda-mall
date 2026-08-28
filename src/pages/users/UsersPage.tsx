import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Search, Ban, CheckCircle, Settings, KeyRound, Eye, EyeOff, RefreshCw, Download, Trash2, UserPlus } from 'lucide-react';
import type { User } from '@/types/types';
import { validateUserPassword } from '@/lib/passwordPolicy';

// 生成随机6位邀请码
function genInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const PAGE_SIZE = 20;

// 带真实姓名的扩展用户类型
interface UserWithKyc extends User {
  real_name?: string;
  kyc_applications?: { real_name: string }[];
}

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithKyc[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserWithKyc | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDialog, setBanDialog] = useState(false);

  // 多选
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialog, setBatchDeleteDialog] = useState(false);
  const [batchBanDialog, setBatchBanDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 单个删除
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<UserWithKyc | null>(null);

  // 密码查看/修改弹窗
  const [pwdTarget, setPwdTarget] = useState<UserWithKyc | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // 新增用户弹窗
  const [addDialog, setAddDialog] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [newMerchantType, setNewMerchantType] = useState<'trial' | 'regular'>('trial');
  const [addingUser, setAddingUser] = useState(false);

  async function fetchUsers() {
    setLoading(true);
    // join kyc_applications 获取真实姓名（取最新审核通过的一条）
    let q = supabase
      .from('users')
      .select('*, kyc_applications(real_name, status)', { count: 'exact' });
    if (search) q = q.or(`phone.ilike.%${search}%,nickname.ilike.%${search}%`);
    if (kycFilter !== 'all') q = q.eq('kyc_status', kycFilter);
    if (levelFilter !== 'all') q = q.eq('member_level', levelFilter);
    if (merchantFilter !== 'all') q = q.eq('merchant_type', merchantFilter);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    // 优先用 users.real_name（提交认证时直接写入），其次从 kyc_applications 取 approved 记录
    const enriched: UserWithKyc[] = (Array.isArray(data) ? data : []).map((u: any) => {
      const kycList: { real_name: string; status: string }[] = u.kyc_applications ?? [];
      const approved = kycList.find(k => k.status === 'approved') ?? kycList[0];
      return { ...u, real_name: u.real_name || approved?.real_name || '' };
    });
    setUsers(enriched);
    setTotal(count ?? 0);
    setCheckedIds(new Set());
  }

  useEffect(() => { fetchUsers(); }, [page, search, kycFilter, levelFilter, merchantFilter]);

  // 全选/反选当前页
  const allChecked = users.length > 0 && users.every(u => checkedIds.has(u.id));
  const someChecked = users.some(u => checkedIds.has(u.id)) && !allChecked;
  function toggleAll() {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (allChecked) { users.forEach(u => next.delete(u.id)); }
      else { users.forEach(u => next.add(u.id)); }
      return next;
    });
  }
  function toggleOne(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // 调用 Edge Function（service_role）执行删除，绕过 RLS 权限限制
  async function callDeleteUsers(ids: string[]): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const { data, error } = await supabase.functions.invoke('delete-users', {
      body: { ids },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (error) return error.message;
    if (data?.error) return data.error;
    return null;
  }

  // 批量删除
  async function handleBatchDelete() {
    const ids = Array.from(checkedIds);
    const err = await callDeleteUsers(ids);
    if (err) { toast.error('批量删除失败：' + err); return; }
    toast.success(`已删除 ${ids.length} 名用户`);
    setBatchDeleteDialog(false);
    setCheckedIds(new Set());
    fetchUsers();
  }

  // 单个删除
  async function handleSingleDelete() {
    if (!singleDeleteTarget) return;
    const err = await callDeleteUsers([singleDeleteTarget.id]);
    if (err) { toast.error('删除失败：' + err); return; }
    toast.success(`已删除用户 ${singleDeleteTarget.phone}`);
    setSingleDeleteTarget(null);
    fetchUsers();
  }

  // 批量封禁
  async function handleBatchBan() {
    const ids = Array.from(checkedIds);
    const { error } = await supabase.from('users').update({ is_banned: true, ban_reason: '批量封禁' }).in('id', ids);
    if (error) { toast.error('批量封禁失败：' + error.message); return; }
    toast.success(`已封禁 ${ids.length} 名用户`);
    setBatchBanDialog(false);
    fetchUsers();
  }

  // 导出用户（拉当前筛选全部）
  async function handleExportUsers() {
    setExporting(true);
    try {
      let q = supabase.from('users').select('phone,nickname,invite_code,kyc_status,member_level,merchant_type,is_banned,created_at');
      if (search) q = q.or(`phone.ilike.%${search}%,nickname.ilike.%${search}%`);
      if (kycFilter !== 'all') q = q.eq('kyc_status', kycFilter);
      if (levelFilter !== 'all') q = q.eq('member_level', levelFilter);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(10000);
      if (error) throw error;
      const rows = (data ?? []).map((u: Partial<User>) => ({
        '手机号': u.phone,
        '昵称': u.nickname ?? '-',
        '邀请码': u.invite_code,
        '认证状态': u.kyc_status,
        '等级': u.member_level,
        '商家类型': u.merchant_type === 'trial' ? '体验商家' : '正式商家',
        '状态': u.is_banned ? '已封禁' : '正常',
        '注册时间': u.created_at ? new Date(u.created_at).toLocaleString('zh-CN') : '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '用户列表');
      XLSX.writeFile(wb, `用户列表_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`已导出 ${rows.length} 名用户`);
    } catch (err: unknown) {
      toast.error('导出失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    setExporting(false);
  }

  async function handleBanToggle(user: User) {
    if (user.is_banned) {
      const { error } = await supabase.from('users').update({ is_banned: false, ban_reason: null }).eq('id', user.id);
      if (error) { toast.error('操作失败'); return; }
      toast.success('已解除封禁');
      fetchUsers();
    } else {
      setSelected(user);
      setBanReason('');
      setBanDialog(true);
    }
  }

  async function confirmBan() {
    if (!selected) return;
    const { error } = await supabase.from('users').update({ is_banned: true, ban_reason: banReason || '违规操作' }).eq('id', selected.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已封禁用户');
    setBanDialog(false);
    fetchUsers();
  }

  // 快捷修改认证状态
  async function handleKycChange(userId: string, kyc_status: string) {
    const { error } = await supabase.from('users').update({ kyc_status }).eq('id', userId);
    if (error) { toast.error('修改失败'); return; }
    toast.success('认证状态已更新');
    fetchUsers();
  }

  // 快捷修改商家类型
  async function handleMerchantTypeChange(userId: string, merchant_type: string) {
    const { error } = await supabase.from('users').update({ merchant_type }).eq('id', userId);
    if (error) { toast.error('修改失败'); return; }
    toast.success('商家类型已更新');
    fetchUsers();
  }

  // 新增用户
  async function handleAddUser() {
    if (!newPhone.trim()) { toast.error('请输入手机号'); return; }
    if (!newNickname.trim()) { toast.error('请输入昵称'); return; }
    const pwdErr = validateUserPassword(newPassword);
    if (pwdErr) { toast.error(pwdErr); return; }
    setAddingUser(true);
    // 检查手机号是否已存在
    const { data: exist } = await supabase.from('users').select('id').eq('phone', newPhone.trim()).maybeSingle();
    if (exist) { toast.error('该手机号已注册'); setAddingUser(false); return; }
    let inviteCode = genInviteCode();
    // 确保邀请码唯一
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await supabase.from('users').select('id').eq('invite_code', inviteCode).maybeSingle();
      if (!dup) break;
      inviteCode = genInviteCode();
    }
    const { error } = await supabase.from('users').insert({
      phone: newPhone.trim(),
      nickname: newNickname.trim(),
      password: newPassword,
      merchant_type: newMerchantType,
      invite_code: inviteCode,
      kyc_status: 'unsubmitted',
      member_level: 'normal',
      is_banned: false,
      user_status: 'active',
      assessment_status: 'pending',
      consecutive_missed: 0,
    });
    setAddingUser(false);
    if (error) { toast.error('新增失败：' + error.message); return; }
    toast.success('用户已新增，邀请码：' + inviteCode);
    setAddDialog(false);
    setNewPhone(''); setNewNickname(''); setNewPassword(''); setNewMerchantType('trial');
    fetchUsers();
  }

  async function openPwdDialog(user: UserWithKyc) {
    setPwdTarget(user);
    setPwdValue('');
    setShowPwd(false);
    setLoadingPwd(true);
    const { data } = await supabase.from('users').select('password').eq('id', user.id).maybeSingle();
    setPwdValue((data as any)?.password ?? '');
    setLoadingPwd(false);
  }

  async function savePwd() {
    if (!pwdTarget) return;
    const pwdErr = validateUserPassword(pwdValue);
    if (pwdErr) { toast.error(pwdErr); return; }
    setSavingPwd(true);
    const { error } = await supabase.from('users').update({ password: pwdValue }).eq('id', pwdTarget.id);
    setSavingPwd(false);
    if (error) { toast.error('修改失败：' + error.message); return; }
    toast.success('密码已更新');
    setPwdTarget(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="用户列表" description={`共 ${total} 名用户`}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setAddDialog(true)}
              className="h-8 gap-1.5 text-xs">
              <UserPlus size={13} />新增用户
            </Button>
            <Button size="sm" variant="ghost" disabled={exporting} onClick={handleExportUsers}
              className="h-8 gap-1.5 text-xs border border-border">
              <Download size={13} />{exporting ? '导出中...' : '导出用户'}
            </Button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索手机号 / 昵称" className="pl-8 h-8 text-xs bg-muted border-border" />
        </div>
        <Select value={kycFilter} onValueChange={v => { setKycFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs bg-muted border-border"><SelectValue placeholder="认证状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部认证</SelectItem>
            <SelectItem value="approved">已认证</SelectItem>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
            <SelectItem value="unsubmitted">未提交</SelectItem>
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border"><SelectValue placeholder="用户等级" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            <SelectItem value="normal">普通用户</SelectItem>
            <SelectItem value="member">会员</SelectItem>
            <SelectItem value="captain">团长</SelectItem>
          </SelectContent>
        </Select>
        <Select value={merchantFilter} onValueChange={v => { setMerchantFilter(v); setPage(1); }}>
          <SelectTrigger className="w-28 h-8 text-xs bg-muted border-border"><SelectValue placeholder="商家类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部商家</SelectItem>
            <SelectItem value="trial">体验商家</SelectItem>
            <SelectItem value="regular">正式商家</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 批量操作栏 */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-sm text-xs">
          <span className="text-primary font-medium">已选 {checkedIds.size} 项</span>
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="ghost" onClick={() => setBatchBanDialog(true)}
              className="h-6 px-2 text-xs border border-border gap-1">
              <Ban size={11} />批量封禁
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBatchDeleteDialog(true)}
              className="h-6 px-2 text-xs border border-destructive/40 text-destructive gap-1 hover:bg-destructive/10">
              <Trash2 size={11} />批量删除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCheckedIds(new Set())}
              className="h-6 px-2 text-xs border border-border text-muted-foreground">
              取消选择
            </Button>
          </div>
        </div>
      )}

      {/* 表格 */}
      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 w-8">
                <Checkbox
                  checked={allChecked}
                  data-state={someChecked ? 'indeterminate' : undefined}
                  onCheckedChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
              </th>
              {['手机号', '真实姓名/昵称', '邀请码', '认证状态', '等级', '商家类型', '注册时间', '状态', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={10} className="py-10 text-center text-xs text-muted-foreground">暂无数据</td></tr>
            ) : users.map((u, i) => (
              <tr key={u.id} className={`border-b border-border last:border-0 ${checkedIds.has(u.id) ? 'bg-primary/5' : i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 w-8">
                  <Checkbox
                    checked={checkedIds.has(u.id)}
                    onCheckedChange={() => toggleOne(u.id)}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">{u.phone}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-foreground font-medium">
                  {u.real_name
                    ? <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{u.real_name}</span>
                        {u.nickname && u.nickname !== u.real_name && (
                          <span className="text-muted-foreground text-[11px]">昵称：{u.nickname}</span>
                        )}
                      </div>
                    : <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">未实名</span>
                        {u.nickname && <span className="text-[11px] text-muted-foreground">昵称：{u.nickname}</span>}
                      </div>}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">{u.invite_code}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Select value={u.kyc_status} onValueChange={v => handleKycChange(u.id, v)}>
                    <SelectTrigger className="h-6 text-xs w-20 bg-muted border-border px-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">已认证</SelectItem>
                      <SelectItem value="pending">待审核</SelectItem>
                      <SelectItem value="rejected">已拒绝</SelectItem>
                      <SelectItem value="unsubmitted">未提交</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={u.member_level} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Select value={u.merchant_type} onValueChange={v => handleMerchantTypeChange(u.id, v)}>
                    <SelectTrigger className="h-6 text-xs w-20 bg-muted border-border px-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">体验商家</SelectItem>
                      <SelectItem value="regular">正式商家</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {u.is_banned
                    ? <span className="text-xs text-destructive">已封禁</span>
                    : <span className="text-xs text-green-600">正常</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/users/${u.id}`)}
                      className="h-6 px-2 text-xs border border-border gap-1">
                      <Settings size={11} />管理
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openPwdDialog(u)}
                      className="h-6 px-2 text-xs border border-border gap-1">
                      <KeyRound size={11} />密码
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleBanToggle(u)}
                      className="h-6 px-2 text-xs border border-border">
                      {u.is_banned
                        ? <><CheckCircle size={11} className="mr-1" />解禁</>
                        : <><Ban size={11} className="mr-1" />封禁</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSingleDeleteTarget(u)}
                      className="h-6 px-2 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10">
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
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

      {/* 单个删除确认 */}
      <AlertDialog open={!!singleDeleteTarget} onOpenChange={open => { if (!open) setSingleDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">确认删除用户</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              即将删除用户 <span className="font-semibold text-foreground">{singleDeleteTarget?.phone}</span>
              {singleDeleteTarget?.real_name && <span className="text-muted-foreground">（{singleDeleteTarget.real_name}）</span>}，该操作不可撤销，用户所有数据将永久清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 px-3 text-xs">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleSingleDelete}
              className="h-7 px-3 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认 */}
      <AlertDialog open={batchDeleteDialog} onOpenChange={setBatchDeleteDialog}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">确认批量删除</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              即将删除 <span className="font-semibold text-destructive">{checkedIds.size}</span> 名用户，该操作不可撤销，用户所有数据将永久清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 px-3 text-xs">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete}
              className="h-7 px-3 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量封禁确认 */}
      <AlertDialog open={batchBanDialog} onOpenChange={setBatchBanDialog}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">确认批量封禁</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              即将封禁 <span className="font-semibold text-destructive">{checkedIds.size}</span> 名用户，封禁后用户将无法登录，可在用户详情中解除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 px-3 text-xs">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchBan}
              className="h-7 px-3 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认封禁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 单个封禁弹窗 */}
      <Dialog open={banDialog} onOpenChange={setBanDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm">封禁用户：{selected?.phone}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input value={banReason} onChange={e => setBanReason(e.target.value)}
              placeholder="封禁原因（选填）" className="text-xs h-8 bg-muted border-border" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setBanDialog(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={confirmBan} className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 border-0">确认封禁</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增用户弹窗 */}
      <Dialog open={addDialog} onOpenChange={open => { if (!open) setAddDialog(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2"><UserPlus size={14} />新增用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">手机号 *</Label>
              <Input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                placeholder="请输入手机号" className="h-8 text-xs bg-muted border-border font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">昵称 *</Label>
              <Input value={newNickname} onChange={e => setNewNickname(e.target.value)}
                placeholder="请输入昵称" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">登录密码 *</Label>
              <div className="relative">
                <Input type={showNewPwd ? 'text' : 'password'} value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="至少 6 位" className="h-8 text-xs bg-muted border-border pr-9 font-mono" />
                <button type="button" onClick={() => setShowNewPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNewPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">商家类型</Label>
              <Select value={newMerchantType} onValueChange={v => setNewMerchantType(v as 'trial' | 'regular')}>
                <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">体验商家</SelectItem>
                  <SelectItem value="regular">正式商家</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setAddDialog(false)}
                className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleAddUser} disabled={addingUser}
                className="h-7 px-4 text-xs gap-1">
                {addingUser ? <><RefreshCw size={11} className="animate-spin" />创建中</> : '确认新增'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 密码查看/修改弹窗 */}      <Dialog open={!!pwdTarget} onOpenChange={open => { if (!open) setPwdTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <KeyRound size={14} />
              账号密码 — {pwdTarget?.nickname || pwdTarget?.phone}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="bg-muted/40 border border-border rounded-sm px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">手机号</span>
                <span className="font-mono font-medium">{pwdTarget?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">邀请码</span>
                <span className="font-mono text-muted-foreground">{pwdTarget?.invite_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">会员等级</span>
                <span>{pwdTarget?.member_level ?? '-'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">登录密码（明文）</Label>
              {loadingPwd ? (
                <div className="h-8 bg-muted rounded-sm animate-pulse" />
              ) : (
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={pwdValue}
                    onChange={e => setPwdValue(e.target.value)}
                    placeholder="输入新密码（至少 6 位）"
                    className="h-8 text-xs bg-muted border-border pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">点击眼睛图标可查看当前密码，修改后点击保存即生效</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPwdTarget(null)}
                className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={savePwd} disabled={savingPwd || loadingPwd}
                className="h-7 px-4 text-xs gap-1">
                {savingPwd ? <><RefreshCw size={11} className="animate-spin" />保存中</> : '保存密码'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
