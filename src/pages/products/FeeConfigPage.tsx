import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';

export default function FeeConfigPage() {
  return (
    <AdminLayout>
      <PageHeader title="费率配置" description="费率配置请前往系统设置 → 分润费率" />
      <div className="max-w-lg">
        <div className="bg-card border border-border rounded-sm p-5">
          <p className="text-sm text-muted-foreground">如需配置分润费率，请前往 <span className="text-primary">系统设置 → 分润费率配置</span>。</p>
        </div>
      </div>
    </AdminLayout>
  );
}
