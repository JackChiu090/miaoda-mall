import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import MobileHeader from '@/components/mobile/MobileHeader';
import { Users, Star, TrendingUp, ChevronRight, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TeamMember {
  id: string;
  nickname: string;
  real_name: string | null;
  phone: string;
  member_level: string;
  kyc_status: string;
  created_at: string;
}

interface TeamStats { total: number; direct: number; member: number; captain: number; }

const LEVEL_LABELS: Record<string, string> = { normal: '普通', member: '会员', captain: '团长' };
const LEVEL_COLORS: Record<string, string> = { normal: '', member: 'text-primary', captain: 'text-warning' };

export default function MTeamPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats>({ total: 0, direct: 0, member: 0, captain: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    // 获取直接下级（通过 distribution_relations）
    supabase.from('distribution_relations')
      .select('user_id,level')
      .eq('parent_id', mobileUser.id)
      .then(async ({ data: rels }) => {
        if (!rels || rels.length === 0) { setLoading(false); return; }
        const userIds = rels.map(r => r.user_id);
        const { data: users } = await supabase.from('users')
          .select('id,nickname,real_name,phone,member_level,kyc_status,created_at')
          .in('id', userIds);
        const memberList = (users ?? []) as TeamMember[];
        setMembers(memberList);
        setStats({
          total: memberList.length,
          direct: memberList.length,
          member: memberList.filter(m => m.member_level === 'member').length,
          captain: memberList.filter(m => m.member_level === 'captain').length,
        });
        setLoading(false);
      });
  }, [mobileUser?.id]);

  const isCaptain = mobileUser?.member_level === 'captain';

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="我的团队"
        back
        right={
          <Link to="/m/commissions" className="text-xs text-primary flex items-center gap-0.5 pr-1">
            奖金明细 <ChevronRight size={13} />
          </Link>
        }
      />

      {/* 团队统计 */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3">
        {[
          { label: '团队总人数', value: stats.total },
          { label: '直接下级', value: stats.direct },
          { label: '会员数', value: stats.member },
          { label: '团长数', value: stats.captain },
        ].map(item => (
          <div key={item.label} className="bg-card border border-border rounded-xl py-3 px-2 text-center">
            {loading ? <Skeleton className="h-6 mx-auto w-8 mb-1" /> : (
              <p className="text-lg font-bold text-foreground">{item.value}</p>
            )}
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 团长资格说明 */}
      {!isCaptain && (
        <div className="mx-4 mb-3 bg-warning/10 border border-warning/20 rounded-xl p-3">
          <p className="text-xs text-foreground font-medium flex items-center gap-1.5 mb-1">
            <Star size={13} className="text-warning" />团长资格解锁条件
          </p>
          <p className="text-xs text-muted-foreground">
            直接推荐 <span className="text-foreground font-medium">3人（已达 {Math.min(stats.direct, 3)}/3）</span>
            且团队纵向达4层深度，即可升级为团长
          </p>
        </div>
      )}

      {/* 成员列表 */}
      <div className="px-4 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">直接下级成员</h2>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无团队成员</p>
            <Button variant="outline" className="mt-3" onClick={() => navigate('/m/invite')}>
              邀请好友加入
            </Button>
          </div>
        ) : (
          members.map(m => (
            <div key={m.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-muted-foreground">
                  {(m.real_name || m.nickname)?.[0] ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {/* 实名（已认证才有）*/}
                {m.real_name ? (
                  <p className="text-sm font-semibold text-foreground truncate">{m.real_name}</p>
                ) : (
                  <p className="text-sm font-semibold text-foreground truncate">{m.nickname ?? '-'}</p>
                )}
                {/* 昵称（实名与昵称不同时才显示） */}
                {m.real_name && m.nickname && m.real_name !== m.nickname && (
                  <p className="text-xs text-muted-foreground truncate">{m.nickname}</p>
                )}
                {/* 电话 */}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone size={10} className="shrink-0" />{m.phone}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[m.member_level]}`}>
                  {LEVEL_LABELS[m.member_level]}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} 加入
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
