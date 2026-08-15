import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Search, Network, RefreshCw, User, Users, ChevronRight, ExternalLink,
  Filter, ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronUp, GitBranch,
  Phone, Calendar, ShieldCheck, Award,
} from 'lucide-react';
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
  collapsed?: boolean;
}

// 节点尺寸与间距
const NODE_W = 180;
const NODE_H = 72;
const H_GAP  = 28;
const V_GAP  = 60;

// 每层节点颜色配置（fill / stroke / badge-bg / text）
const LEVEL_COLORS = [
  { fill: 'hsl(var(--primary)/0.12)', stroke: 'hsl(var(--primary))',   badge: 'hsl(var(--primary))',   text: 'hsl(var(--primary))' },
  { fill: '#eff6ff',                  stroke: '#3b82f6',                badge: '#3b82f6',               text: '#1d4ed8' },
  { fill: '#f0fdf4',                  stroke: '#22c55e',                badge: '#22c55e',               text: '#15803d' },
  { fill: '#fff7ed',                  stroke: '#f97316',                badge: '#f97316',               text: '#c2410c' },
  { fill: '#faf5ff',                  stroke: '#a855f7',                badge: '#a855f7',               text: '#7e22ce' },
];
const levelColor = (d: number) => LEVEL_COLORS[Math.min(d, LEVEL_COLORS.length - 1)];

export default function ReferralGraphPage() {
  const navigate = useNavigate();
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const [allUsers, setAllUsers]   = useState<ReferralUser[]>([]);
  const [loading, setLoading]     = useState(false);

  // 筛选条件
  const [referrerSearch, setReferrerSearch] = useState('');
  const [referredSearch, setReferredSearch] = useState('');
  const [timeFilter, setTimeFilter]         = useState('all');

  // 折叠节点 id 集合
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 选中节点详情（右侧 Sheet）
  const [selectedNode, setSelectedNode]       = useState<ReferralUser | null>(null);
  const [selectedReferrals, setSelectedReferrals] = useState<ReferralUser[]>([]);
  const [selectedReferrer, setSelectedReferrer]   = useState<ReferralUser | null>(null);
  const [loadingDetail, setLoadingDetail]     = useState(false);

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
    if (timeFilter === '7d')  return (now.getTime() - d.getTime()) <= 7  * 86400000;
    if (timeFilter === '30d') return (now.getTime() - d.getTime()) <= 30 * 86400000;
    if (timeFilter === '90d') return (now.getTime() - d.getTime()) <= 90 * 86400000;
    return true;
  }, [timeFilter]);

  // 构建用户映射与推荐关系
  const { userMap, roots, referredSet, childrenMap } = useMemo(() => {
    const map  = new Map<string, ReferralUser>();
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

  // 筛选根节点列表
  const filteredRoots = useMemo(() => {
    function hasReferredInTime(userId: string): boolean {
      const kids = childrenMap.get(userId) ?? [];
      return kids.some(k => inTimeRange(k.created_at)) || kids.some(k => hasReferredInTime(k.id));
    }
    const matchUser = (u: ReferralUser, s: string) => {
      const q = s.trim().toLowerCase();
      return (u.phone ?? '').toLowerCase().includes(q)
        || (u.nickname ?? '').toLowerCase().includes(q)
        || (u.real_name ?? '').toLowerCase().includes(q)
        || (u.invite_code ?? '').toLowerCase().includes(q);
    };
    if (referrerSearch.trim()) {
      const matched: ReferralUser[] = [];
      for (const u of allUsers) {
        if (matchUser(u, referrerSearch) && !matched.includes(u)) matched.push(u);
      }
      return matched.filter(u => inTimeRange(u.created_at) || hasReferredInTime(u.id));
    }
    if (referredSearch.trim()) {
      const matchedReferred = allUsers.filter(u => u.referrer_id && matchUser(u, referredSearch));
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
  }, [roots, allUsers, referrerSearch, referredSearch, inTimeRange, userMap, childrenMap]);

  // ── 布局树（后序遍历计算子树宽度，支持折叠） ──
  const { nodes, edges, totalWidth, totalHeight } = useMemo(() => {
    const nodeList: TreeNode[] = [];
    const edgeList: { from: TreeNode; to: TreeNode }[] = [];
    let cursorX = 0;

    const layout = (user: ReferralUser, depth: number): TreeNode => {
      const isCollapsed = collapsed.has(user.id);
      // 折叠时视为叶节点
      const rawKids = isCollapsed ? [] : (childrenMap.get(user.id) ?? []).filter(k =>
        timeFilter === 'all' ? true : inTimeRange(k.created_at),
      );
      const childNodes = rawKids.map(k => layout(k, depth + 1));

      const treeWidth = childNodes.length > 0
        ? childNodes.reduce((s, c) => s + c.width, 0) + H_GAP * Math.max(0, childNodes.length - 1)
        : NODE_W;

      const node: TreeNode = {
        user, children: childNodes, depth,
        x: 0, y: depth * (NODE_H + V_GAP), width: treeWidth,
        collapsed: isCollapsed,
      };

      if (childNodes.length === 0) {
        node.x = cursorX;
        cursorX += NODE_W + H_GAP;
      } else {
        const firstX = childNodes[0].x;
        const lastX  = childNodes[childNodes.length - 1].x;
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
  }, [filteredRoots, childrenMap, timeFilter, inTimeRange, collapsed]);

  // 统计
  const stats = useMemo(() => ({
    total: allUsers.length,
    withReferrer: referredSet.size,
    roots: roots.length,
    shown: nodes.length,
  }), [allUsers, referredSet, roots, nodes]);

  // 折叠/展开切换
  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // 展开全部 / 折叠全部
  const expandAll  = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    const ids = new Set(allUsers.filter(u => (childrenMap.get(u.id)?.length ?? 0) > 0).map(u => u.id));
    setCollapsed(ids);
  }, [allUsers, childrenMap]);

  // 节点点击：打开右侧 Sheet
  const handleNodeClick = useCallback(async (user: ReferralUser) => {
    setSelectedNode(user);
    setSelectedReferrals([]);
    setSelectedReferrer(null);
    setLoadingDetail(true);
    const [referralsRes, referrerRes] = await Promise.all([
      supabase.from('users')
        .select('id,phone,nickname,real_name,invite_code,created_at,member_level,kyc_status,merchant_type')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      user.referrer_id
        ? supabase.from('users')
            .select('id,phone,nickname,real_name,invite_code,created_at,member_level,kyc_status')
            .eq('id', user.referrer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setSelectedReferrals((referralsRes.data ?? []) as ReferralUser[]);
    setSelectedReferrer((referrerRes as any).data ?? null);
    setLoadingDetail(false);
  }, []);

  const displayName = (u: ReferralUser) => u.real_name || u.nickname || u.phone || u.id.slice(0, 8);

  // ── SVG 节点渲染 ──
  const renderNode = (n: TreeNode) => {
    const lc = levelColor(n.depth);
    const allKids = childrenMap.get(n.user.id) ?? [];
    const hasKids = allKids.length > 0;
    const isCollapsed = n.collapsed;
    const kidsVisible = n.children.length;
    const cx = n.x + NODE_W / 2;

    return (
      <g key={n.user.id} transform={`translate(${n.x},${n.y})`}
        className="cursor-pointer" onClick={() => handleNodeClick(n.user)}>
        {/* 阴影滤镜通过 filter 属性引用 */}
        <rect width={NODE_W} height={NODE_H} rx={8}
          fill={lc.fill} stroke={lc.stroke} strokeWidth={1.5}
          filter="url(#node-shadow)" />

        {/* 左侧层级色条 */}
        <rect x={0} y={0} width={4} height={NODE_H} rx={2}
          fill={lc.stroke} />

        {/* 名称 */}
        <text x={16} y={22} fontSize={12} fontWeight={700} fill="hsl(var(--foreground))">
          {displayName(n.user).slice(0, 11)}
        </text>

        {/* 手机号 */}
        <text x={16} y={37} fontSize={10} fill="hsl(var(--muted-foreground))">
          {n.user.phone ?? '—'}
        </text>

        {/* 下级人数 */}
        <text x={16} y={52} fontSize={9} fill={lc.text}>
          {hasKids ? `直推 ${allKids.length} 人` : '无下级'}
        </text>

        {/* 层级徽章 */}
        <rect x={NODE_W - 30} y={6} width={24} height={15} rx={4} fill={lc.badge} />
        <text x={NODE_W - 18} y={17} fontSize={9} fontWeight={700}
          fill="#fff" textAnchor="middle">L{n.depth}</text>

        {/* 折叠/展开按钮（有子节点时显示） */}
        {hasKids && (
          <g transform={`translate(${cx - 10}, ${NODE_H - 10})`}
            onClick={e => toggleCollapse(n.user.id, e)}
            className="cursor-pointer">
            <rect x={0} y={0} width={20} height={12} rx={6}
              fill={lc.stroke} opacity={0.9} />
            <text x={10} y={9} fontSize={8} fontWeight={700}
              fill="#fff" textAnchor="middle">
              {isCollapsed ? `+${allKids.length}` : '−'}
            </text>
          </g>
        )}

        {/* 折叠时，在节点下方显示隐藏子树数量 */}
        {isCollapsed && (
          <text x={cx - n.x} y={NODE_H + 14} fontSize={9}
            fill={lc.text} textAnchor="middle" fontWeight={600}>
            ▼ 已折叠 {allKids.length} 个下级
          </text>
        )}
      </g>
    );
  };

  // ── SVG 边渲染（正交折线连接器） ──
  const renderEdge = (e: { from: TreeNode; to: TreeNode }, i: number) => {
    const x1 = e.from.x + NODE_W / 2;
    const y1 = e.from.y + NODE_H;
    const x2 = e.to.x   + NODE_W / 2;
    const y2 = e.to.y;
    const midY = y1 + V_GAP / 2;
    const lc = levelColor(e.from.depth);
    return (
      <path key={`edge-${i}`}
        d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
        fill="none" stroke={lc.stroke} strokeWidth={1.5} strokeOpacity={0.5}
        strokeDasharray={e.to.depth > 3 ? '4 2' : undefined}
      />
    );
  };

  return (
    <AdminLayout>
      <PageHeader
        title="推荐层级关系图"
        description={`共 ${stats.total} 名用户 · 有推荐关系 ${stats.withReferrer} 人 · 当前展示 ${stats.shown} 个节点`}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={expandAll}
              className="h-8 gap-1.5 text-xs border border-border">
              <ChevronDown size={13} />展开全部
            </Button>
            <Button size="sm" variant="ghost" onClick={collapseAll}
              className="h-8 gap-1.5 text-xs border border-border">
              <ChevronUp size={13} />折叠全部
            </Button>
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
          <Label className="text-[11px] text-muted-foreground mb-1 block">推荐人</Label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={referrerSearch} onChange={e => setReferrerSearch(e.target.value)}
              placeholder="手机号 / 昵称 / 邀请码" className="pl-8 h-8 text-xs bg-muted border-border" />
          </div>
        </div>
        <div className="flex-1 min-w-44">
          <Label className="text-[11px] text-muted-foreground mb-1 block">被推荐人</Label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={referredSearch} onChange={e => setReferredSearch(e.target.value)}
              placeholder="手机号 / 昵称 / 邀请码" className="pl-8 h-8 text-xs bg-muted border-border" />
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
          <Button size="sm" variant="ghost"
            onClick={() => { setReferrerSearch(''); setReferredSearch(''); setTimeFilter('all'); }}
            className="h-8 text-xs border border-border">重置</Button>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: '用户总数',     value: stats.total,       icon: Users,   color: 'text-primary' },
          { label: '有推荐关系',   value: stats.withReferrer, icon: Network, color: 'text-blue-500' },
          { label: '顶级推荐人',   value: stats.roots,        icon: User,    color: 'text-green-500' },
          { label: '当前展示节点', value: stats.shown,        icon: GitBranch, color: 'text-orange-500' },
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Network size={13} />
              <span>推荐层级关系图（点击节点查看详情）</span>
            </div>
            {/* 层级图例 */}
            <div className="hidden md:flex items-center gap-2">
              {LEVEL_COLORS.map((lc, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: lc.badge }} />
                  <span className="text-[10px] text-muted-foreground">L{i}{i === LEVEL_COLORS.length - 1 ? '+' : ''}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
              className="h-7 w-7 p-0 border border-border"><ZoomOut size={13} /></Button>
            <span className="text-[11px] text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(2, z + 0.15))}
              className="h-7 w-7 p-0 border border-border"><ZoomIn size={13} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setZoom(1)}
              className="h-7 w-7 p-0 border border-border"><Maximize2 size={13} /></Button>
          </div>
        </div>

        {/* SVG 画布 */}
        <div ref={svgContainerRef} className="w-full overflow-auto bg-muted/10" style={{ maxHeight: '72vh' }}>
          {loading ? (
            <div className="py-24 text-center text-xs text-muted-foreground">
              <RefreshCw size={28} className="mx-auto mb-3 animate-spin text-primary" />
              正在加载推荐关系数据…
            </div>
          ) : nodes.length === 0 ? (
            <div className="py-24 text-center text-xs text-muted-foreground">
              <Network size={36} className="mx-auto mb-3 opacity-30" />
              <p>暂无推荐关系数据</p>
              <p className="mt-1 text-[11px]">当前筛选条件下无匹配结果</p>
            </div>
          ) : (
            <svg
              width={(totalWidth + 48) * zoom}
              height={(totalHeight + 64) * zoom}
              style={{ minWidth: '100%', display: 'block' }}
            >
              <defs>
                <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.08)" />
                </filter>
              </defs>
              <g transform={`translate(24,24) scale(${zoom})`}>
                {/* 连线先渲染（在节点下方） */}
                {edges.map(renderEdge)}
                {/* 节点后渲染（覆盖连线） */}
                {nodes.map(renderNode)}
              </g>
            </svg>
          )}
        </div>
      </div>

      {/* 节点详情 Sheet（右侧抽屉） */}
      <Sheet open={!!selectedNode} onOpenChange={open => { if (!open) setSelectedNode(null); }}>
        <SheetContent side="right" className="w-full max-w-sm p-0 flex flex-col">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
            <SheetTitle className="text-sm flex items-center gap-2">
              <Network size={14} className="text-primary" />推荐人详情
            </SheetTitle>
            <SheetDescription className="text-xs">
              点击直推记录可跳转用户管理页
            </SheetDescription>
          </SheetHeader>

          {selectedNode && (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* 用户信息卡 */}
              <div className="bg-muted/40 border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-base font-bold text-primary-foreground"
                    style={{ background: levelColor(nodes.find(n => n.user.id === selectedNode.id)?.depth ?? 0).badge }}>
                    {displayName(selectedNode).charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{displayName(selectedNode)}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{selectedNode.phone}</p>
                  </div>
                  <StatusBadge status={selectedNode.member_level} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Award size={11} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">邀请码</span>
                    <span className="font-mono text-foreground">{selectedNode.invite_code ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={11} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">认证</span>
                    <span className="text-foreground">{selectedNode.kyc_status}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">注册</span>
                    <span className="text-foreground">{new Date(selectedNode.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users size={11} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">直推</span>
                    <span className="font-medium text-foreground">{selectedReferrals.length} 人</span>
                  </div>
                </div>
              </div>

              {/* 上级推荐人 */}
              {(selectedNode.referrer_id || selectedReferrer) && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">上级推荐人</p>
                  {loadingDetail ? (
                    <div className="h-12 bg-muted/40 rounded-lg animate-pulse" />
                  ) : selectedReferrer ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => { setSelectedNode(null); navigate(`/users/${selectedReferrer!.id}`); }}>
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <User size={12} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{displayName(selectedReferrer)}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{selectedReferrer.phone}</p>
                      </div>
                      <ExternalLink size={11} className="text-muted-foreground shrink-0" />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">上级信息不可用</p>
                  )}
                </div>
              )}

              {/* 直接推荐记录 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-foreground">
                    直接推荐记录
                    {selectedReferrals.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                        {selectedReferrals.length}
                      </Badge>
                    )}
                  </p>
                  {loadingDetail && <RefreshCw size={11} className="animate-spin text-muted-foreground" />}
                </div>

                {loadingDetail ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/40 rounded-lg animate-pulse" />)}
                  </div>
                ) : selectedReferrals.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                    <Phone size={20} className="mx-auto mb-2 opacity-30" />
                    该用户暂无直接推荐记录
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedReferrals.map((r, idx) => (
                      <div key={r.id}
                        className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedNode(null); navigate(`/users/${r.id}`); }}>
                        <span className="text-[10px] text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{displayName(r)}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{r.phone}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString('zh-CN')}
                          </span>
                          <ChevronRight size={11} className="text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sheet 底部操作 */}
          {selectedNode && (
            <div className="px-5 py-4 border-t border-border shrink-0 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs"
                onClick={() => setSelectedNode(null)}>关闭</Button>
              <Button size="sm" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => { const id = selectedNode.id; setSelectedNode(null); navigate(`/users/${id}`); }}>
                <ExternalLink size={12} />查看用户管理
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
