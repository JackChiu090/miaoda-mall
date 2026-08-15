import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

interface Agreement {
  code: string;
  title: string;
  content: string;
  version: string;
  updated_at: string;
}

export default function MAgreementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('platform_agreements').select('code,title,content,version,updated_at').eq('is_active', true)
      .then(({ data }) => { setAgreements(data ?? []); setLoading(false); });
  }, []);

  // 默认激活 tab：优先 URL 参数，其次第一个
  const defaultTab = tabParam && agreements.find(a => a.code === tabParam)
    ? tabParam
    : agreements[0]?.code;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MobileHeader title="平台协议" back className="shrink-0" />

      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-64" />
          </div>
        ) : agreements.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无协议</p>
          </div>
        ) : (
          <Tabs defaultValue={defaultTab ?? agreements[0]?.code}>
            <TabsList className="w-full mb-4">
              {agreements.map(a => (
                <TabsTrigger key={a.code} value={a.code} className="flex-1 text-xs">{a.title}</TabsTrigger>
              ))}
            </TabsList>
            {agreements.map(a => (
              <TabsContent key={a.code} value={a.code}>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                    <span className="text-xs text-muted-foreground">v{a.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    更新时间：{new Date(a.updated_at).toLocaleDateString('zh-CN')}
                  </p>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {a.content || '协议内容暂未配置，请联系平台客服。'}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
