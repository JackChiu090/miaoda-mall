import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { ProductCategory } from '@/types/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState({ name: '', sort_order: 0 });
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);

  async function fetchCategories() {
    setLoading(true);
    const { data } = await supabase.from('product_categories').select('*').order('sort_order', { ascending: true });
    setCategories(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchCategories(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', sort_order: 0 });
    setDialogOpen(true);
  }

  function openEdit(cat: ProductCategory) {
    setEditing(cat);
    setForm({ name: cat.name, sort_order: cat.sort_order });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('请输入分类名称'); return; }
    if (editing) {
      const { error } = await supabase.from('product_categories').update({ name: form.name, sort_order: form.sort_order }).eq('id', editing.id);
      if (error) { toast.error('更新失败'); return; }
      toast.success('分类已更新');
    } else {
      const { error } = await supabase.from('product_categories').insert({ name: form.name, sort_order: form.sort_order });
      if (error) { toast.error('创建失败'); return; }
      toast.success('分类已创建');
    }
    setDialogOpen(false);
    fetchCategories();
  }

  async function handleToggleActive(cat: ProductCategory) {
    const { error } = await supabase.from('product_categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success(cat.is_active ? '分类已禁用' : '分类已启用');
    fetchCategories();
  }

  async function handleDeleteClick(cat: ProductCategory) {
    // 先检查是否有商品关联此分类
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id);
    if ((count ?? 0) > 0) {
      toast.error(`无法删除：该分类下还有 ${count} 件商品，请先移除或修改这些商品的分类`);
      return;
    }
    setDeleteTarget(cat);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('product_categories').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('删除失败，请重试'); setDeleteTarget(null); return; }
    toast.success('分类已删除');
    setDeleteTarget(null);
    fetchCategories();
  }

  return (
    <AdminLayout>
      <PageHeader title="商品分类管理"
        action={<Button size="sm" onClick={openCreate} className="h-8 text-xs gap-1"><Plus size={13} />新建分类</Button>} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['分类名称', '排序', '状态', '创建时间', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : categories.map((cat, i) => (
              <tr key={cat.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-medium">{cat.name}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{cat.sort_order}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {cat.is_active
                    ? <span className="text-xs text-success">启用</span>
                    : <span className="text-xs text-muted-foreground">禁用</span>}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(cat.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cat)} className="h-6 w-6 p-0 border border-border">
                      <Pencil size={11} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(cat)}
                      className="h-6 px-2 text-xs border border-border text-muted-foreground">
                      {cat.is_active ? '禁用' : '启用'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(cat)}
                      className="h-6 w-6 p-0 border border-destructive/30 text-destructive hover:bg-destructive/10">
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">{editing ? '编辑分类' : '新建分类'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">分类名称</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：数码电子" className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">排序（数字越小越靠前）</Label>
              <Input type="number" min={0} value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                className="h-8 text-xs bg-muted border-border" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">确认删除分类</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              即将删除分类「{deleteTarget?.name}」，删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 px-3 text-xs">取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="h-7 px-3 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
