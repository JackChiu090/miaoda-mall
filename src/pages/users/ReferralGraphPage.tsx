import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Network, RefreshCw, User, Users, ChevronRight, ExternalLink, Filter, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { User as UserType } from '@/types/types';

// 带推荐信息的用户类型
interface ReferralUser extends UserType {
  real_name?: string;
  kyc_applications?: { real_name: string; status: string }[];
}

// 树节点
interface TreeNode {
  user: ReferralUser;
  children: TreeNode[];
  depth: number;
  x: number;
  y: number;
  width: number;
}

// 节点尺寸与间距
const NODE_W = 150;
const NODE_H = 56;
const H_GAP = 24;
const V_GAP = 56;

export default function ReferralGraphPage() {
  const navigate = useNavigate();

  const [allUsers, setAllUsers] = useState<ReferralUser[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选条件
  const [referrerSearch, setReferrerSearch] = useState('');
  const [referredSearch, setReferredSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');

  // 选中节点详情
  const [selectedNode, setSelectedNode] = useState<ReferralUser | null>(null);
  const [selectedReferrals, setSelectedReferrals] = useState<ReferralUser[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 缩放
  const [zoom, setZoom] = useState(1);

  // 拉取全部用户（含 referrer_id）
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('*, kyc_applications(real_name, status)')
      .order('created_at', { ascending: true })
      .limit(5000);
    setLoading(false);
    if (error) { toast.error('加载用户数据失败'); return; }
    const enriched: ReferralUser[] = (Array.isArray(data) ? data : []).map((u: any) => {
      const kycList: { real_name: string; status: string }[] = u.kyc_applications ?? [];
      const approved = kycList.find(k => k.status === 'approved') ?? kycList[0];
      return { ...u, real_name: u.real_name || approved?.real_name || '' };
    });
    setAllUsers(enriched);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // 时间过滤辅助
  const inTimeRange = useCallback((createdAt: string) => {
    if (timeFilter === 'all') return true;
    const d = new Date(createdAt);
    const now = new Date();
    if (timeFilter === '7d') return (now.getTime() - d.getTime()) <= 7 * 86400000;
    if (timeFilter === '30d') return (now.getTime() - d.getTime()) <= 30 * 86400000;
    if (timeFilter === '90d') return (now.getTime() - d.getTime()) <= 90 * 86400000;
    return true;
  }, [timeFilter]);

  // 构建用户映射与推荐关系
  const { userMap, roots, referredSet, childrenMap } = useMemo(() => {
    const map = new Map<string, ReferralUser>();
    const cMap = new Map<string, ReferralUser[]>();
    const refSet = new Set<string>();

    for (const u of allUsers) {
      map.set(u.id, u);
      if (u.referrer_id) refSet.add(u.id);
    }
    for (const u of allUsers) {
      if (u.referrer_id) {
        const arr = cMap.get(u.referrer_id) ?? [];
        arr.push(u);
        cMap.set(u.referrer_id, arr);
      }
    }
    const rootList = allUsers.filter(u => !u.referrer_id || !map.has(u.referrer_id));
    return { userMap: map, roots: rootList, referredSet: refSet, childrenMap: cMap };
  }, [allUsers]);

  // 筛选：按推荐人 / 被推荐人 / 时间
  const filteredRoots = useMemo(() => {
    const matchReferrer = (u: ReferralUser) => {
      if (!referrerSearch.trim()) return true;
      const s = referrerSearch.trim().toLowerCase();
      return (u.phone ?? '').toLowerCase().includes(s) ||
        (u.nickname ?? '').toLowerCase().includes(s) ||
        (u.real_name ?? '').toLowerCase().includes(s) ||
        (u.invite_code ?? '').toLowerCase().includes(s);
    };
    const matchReferred = (u: ReferralUser) => {
      if (!referredSearch.trim()) return true;
      const s = referredSearch.trim().toLowerCase();
      return (u.phone ?? '').toLowerCase().includes(s) ||
        (u.nickname ?? '').toLowerCase().includes(s) ||
        (u.real_name ?? '').toLowerCase().includes(s) ||
        (u.invite_code ?? '').toLowerCase().includes(s);
    };

    // 若指定了推荐人筛选，则只展示匹配的推荐人及其子树
    if (referrerSearch.trim()) {
      const matched = roots.filter(matchReferrer);
      // 也匹配非根的推荐人
      for (const u of allUsers) {
        if (u.referrer_id && matchReferrer(u) && !matched.includes(u)) matched.push(u);
      }
      return matched.filter(u => inTimeRange(u.created_at) || hasReferredInTime(u.id));
    }

    // 若指定了被推荐人筛选，定位其推荐链路
    if (referredSearch.trim()) {
      const matchedReferred = allUsers.filter(u => u.referrer_id && matchReferred(u));
      const chainRoots = new Set<string>();
      for (const r of matchedReferred) {
        let cur: ReferralUser | undefined = r;
        let guard = 0;
        while (cur && guard < 20) {
          if (!cur.referrer_id || !userMap.has(cur.referrer_id)) { chainRoots.add(cur.id); break; }
          cur = userMap.get(cur.referrer_id);
          guard++;
        }
      }
      return roots.filter(r => chainRoots.has(r.id));
    }

    return roots.filter(u => inTimeRange(u.created_at) || hasReferredInTime(u.id));

    function hasReferredInTime(userId: string): boolean {
      const kids = childrenMap.get(userId) ?? [];
      return kids.some(k => inTimeRange(k.created_at)) || kids.some(k => hasReferredInTime(k.id));
    }
  }, [roots, allUsers, referrerSearch, referredSearch, inTimeRange, userMap, childrenMap]);

  // 布局树（递归计算子树宽度，后序遍历）
  const { nodes, edges, totalWidth, totalHeight } = useMemo(() => {
    const nodeList: TreeNode[] = [];
    const edgeList: { from: TreeNode; to: TreeNode }[] = [];
    let cursorX = 0;

    const layout = (user: ReferralUser, depth: number): TreeNode => {
      const kids = (childrenMap.get(user.id) ?? []).filter(k => {
        // 子节点也要满足时间筛选（若设了时间筛选，仅展示该时间窗口内形成的推荐关系）
        if (timeFilter === 'all') return true;
        return inTimeRange(k.created_at);
      });
      const childNodes = kids.map(k => layout(k, depth + 1));
      const width = childNodes.length > 0
        ? childNodes.reduce((s, c) => s + c.width, 0) + H_GAP * Math.max(0, childNodes.length - 1)
        : NODE_W;
      const node: TreeNode = { user, children: childNodes, depth, x: 0, y: depth * (NODE_H + V_GAP), width };
      // 水平定位
      if (childNodes.length === 0) {
        node.x = cursorX;
        cursorX += NODE_W + H_GAP;
      } else {
        const firstX = childNodes[0].x;
        const lastX = childNodes[childNodes.length - 1].x;
        node.x = (firstX + lastX) / 2;
      }
      for (const c of childNodes) edgeList.push({ from: node, to: c });
      nodeList.push(node);
      return node;
    };

    for (const root of filteredRoots) layout(root, 0);

    const maxX = nodeList.length ? Math.max(...nodeList.map(n => n.x)) + NODE_W : 0;
    const maxY = nodeList.length ? Math.max(...nodeList.map(n => n.y)) + NODE_H : 0;
    return { nodes: nodeList, edges: edgeList, totalWidth: maxX, totalHeight: maxY };
  }, [filteredRoots, childrenMap, timeFilter, inTimeRange]);

  // 统计
  const stats = useMemo(() => ({
    total: allUsers.length,
    withReferrer: referredSet.size,
    roots: roots.length,
    shown: nodes.length,
  }), [allUsers, referredSet, roots, nodes]);

  // 节点点击：加载该用户的直接推荐记录
  const handleNodeClick = useCallback(async (user: ReferralUser) => {
    setSelectedNode(user);
    setLoadingDetail(true);
    const { data } = await supabase
      .from('users')
      .select('id, phone, nickname, real_name, invite_code, created_at, member_level, kyc_status')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setSelectedReferrals((data ?? []) as ReferralUser[]);
    setLoadingDetail(false);
  }, []);

  const displayName = (u: ReferralUser) => u.real_name || u.nickname || u.phone || u.id.slice(0, 8);

  return (
    <AdminLayout>
      <PageHeader
        title="推荐关系图表"
        description={`共 ${stats.total} 名用户 · 有推荐关系 ${stats.withReferrer} 人 · 当前展示 ${stats.shown} 个节点`}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={fetchUsers} disabled={loading}
              className="h-8 gap-1.5 text-xs border border-border">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />刷新
            </Button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-card border border-border rounded-sm p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mr-1">
          <Filter size={13} />筛选
        </div>
        <div className="flex-1 min-w-44">
          <Label className="text-[11px] text-muted-foreground mb-1 block">推荐人（手机号/昵称/邀请码）</Label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={referrerSearch} onChange={e => setReferrerSearch(e.target.value)}
              placeholder="搜索推荐人" className="pl-8 h-8 text-xs bg-muted border-border" />
          </div>
        </div>
        <div className="flex-1 min-w-44">
          <Label className="text-[11px] text-muted-foreground mb-1 block">被推荐人（手机号/昵称/邀请码）</Label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={referredSearch} onChange={e => setReferredSearch(e.target.value)}
              placeholder="搜索被推荐人" className="pl-8 h-8 text-xs bg-muted border-border" />
          </div>
        </div>
        <div className="w-36">
          <Label className="text-[11px] text-muted-foreground mb-1 block">推荐时间</Label>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
              <SelectItem value="90d">近 90 天</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(referrerSearch || referredSearch || timeFilter !== 'all') && (
          <Button size="sm" variant="ghost" onClick={() => { setReferrerSearch(''); setReferredSearch(''); setTimeFilter('all'); }}
            className="h-8 text-xs border border-border">重置</Button>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: '用户总数', value: stats.total, icon: Users, color: 'text-primary' },
          { label: '有推荐关系', value: stats.withReferrer, icon: Network, color: 'text-chart-2' },
          { label: '顶级推荐人', value: stats.roots, icon: User, color: 'text-chart-3' },
          { label: '当前展示节点', value: stats.shown, icon: Network, color: 'text-chart-4' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-sm p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-muted flex items-center justify-center shrink-0">
              <s.icon size={16} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
              <p className="text-lg font-semibold text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 图表区 */}
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network size={13} />
            <span>推荐层级关系图（点击节点查看详情）</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
              className="h-7 w-7 p-0 border border-border"><ZoomOut size={13} /></Button>
            <span className="text-[11px] text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(2, z + 0.15))}
              className="h-7 w-7 p-0 border border-border"><ZoomIn size={13} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setZoom(1)}
              className="h-7 w-7 p-0 border border-border"><Maximize2 size={13} /></Button>
          </div>
        </div>

        {/* SVG 画布 */}
        <div className="w-full overflow-auto" style={{ maxHeight: '70vh' }}>
          {loading ? (
            <div className="py-20 text-center text-xs text-muted-foreground">加载中...</div>
          ) : nodes.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground">
              <Network size={32} className="mx-auto mb-2 text-muted-foreground/50" />
              暂无推荐关系数据，或当前筛选条件下无匹配结果
            </div>
          ) : (
            <svg
              width={totalWidth * zoom + 48}
              height={totalHeight * zoom + 48}
              style={{ minWidth: '100%' }}
            >
              <g transform={`translate(24,24) scale(${zoom})`}>
                {/* 连线 */}
                {edges.map((e, i) => {
                  const x1 = e.from.x + NODE_W / 2;
                  const y1 = e.from.y + NODE_H;
                  const x2 = e.to.x + NODE_W / 2;
                  const y2 = e.to.y;
                  const midY = (y1 + y2) / 2;
                  return (
                    <path key={`e-${i}`}
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      fill="none" stroke="hsl(var(--border))" strokeWidth={1.5}
                    />
                  );
                })}
                {/* 节点 */}
                {nodes.map((n) => {
                  const isRoot = n.depth === 0;
                  const hasKids = n.children.length > 0;
                  return (
                    <g key={n.user.id} transform={`translate(${n.x}, ${n.y})`}
                      className="cursor-pointer" onClick={() => handleNodeClick(n.user)}>
                      <rect
                        width={NODE_W} height={NODE_H} rx={6}
                        fill={isRoot ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--card))'}
                        stroke={isRoot ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                        strokeWidth={isRoot ? 1.5 : 1}
                      />
                      <text x={10} y={20} fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
                        {displayName(n.user).slice(0, 12)}
                      </text>
                      <text x={10} y={36} fontSize={9} fill="hsl(var(--muted-foreground))">
                        {n.user.phone}
                      </text>
                      <text x={10} y={49} fontSize={9} fill="hsl(var(--muted-foreground))">
                        {hasKids ? `${n.children.length} 人推荐` : '无下级'}
                        {' · '}
                        {new Date(n.user.created_at).toLocaleDateString('zh-CN')}
                      </text>
                      {/* 层级标记 */}
                      <rect x={NODE_W - 26} y={6} width={20} height={14} rx={3}
                        fill={isRoot ? 'hsl(var(--primary))' : 'hsl(var(--muted))'} />
                      <text x={NODE_W - 16} y={16} fontSize={8} fontWeight={600}
                        fill={isRoot ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))'}
                        textAnchor="middle">L{n.depth}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
      </div>

      {/* 节点详情弹窗 */}
      <Dialog open={!!selectedNode} onOpenChange={open => { if (!open) setSelectedNode(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Network size={14} />推荐人详情
            </DialogTitle>
            <DialogDescription className="text-xs">
              查看该用户的推荐信息与直接推荐记录
            </DialogDescription>
          </DialogHeader>
          {selectedNode && (
            <div className="space-y-3 mt-1">
              {/* 用户信息 */}
              <div className="bg-muted/40 border border-border rounded-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{displayName(selectedNode)}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{selectedNode.phone}</p>
                    </div>
                  </div>
                  <StatusBadge status={selectedNode.member_level} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">邀请码：</span><span className="font-mono">{selectedNode.invite_code}</span></div>
                  <div><span className="text-muted-foreground">认证：</span>{selectedNode.kyc_status}</div>
                  <div><span className="text-muted-foreground">注册：</span>{new Date(selectedNode.created_at).toLocaleDateString('zh-CN')}</div>
                  <div><span className="text-muted-foreground">推荐人数：</span>{selectedReferrals.length}</div>
                </div>
              </div>

              {/* 推荐记录 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-foreground">直接推荐记录</p>
                  {loadingDetail && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
                </div>
                {selectedReferrals.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">该用户暂无直接推荐记录</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-border rounded-sm">
                    {selectedReferrals.map(r => (
                      <div key={r.id}
                        className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                        onClick={() => { setSelectedNode(null); navigate(`/users/${r.id}`); }}>
                        <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{displayName(r)}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{r.phone}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(r.created_at).toLocaleDateString('zh-CN')}
                        </span>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}
                  className="h-7 px-3 text-xs border border-border">关闭</Button>
                <Button size="sm" onClick={() => { const id = selectedNode.id; setSelectedNode(null); navigate(`/users/${id}`); }}
                  className="h-7 px-3 text-xs gap-1">
                  <ExternalLink size={12} />查看用户管理
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}