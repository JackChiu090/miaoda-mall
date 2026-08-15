import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, MapPin } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

interface Address {
  id: string;
  receiver_name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  is_default: boolean;
}

export default function MAddressPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ receiver_name: '', phone: '', province: '', city: '', district: '', detail: '' });
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!mobileUser) return;
    supabase.from('user_addresses').select('*').eq('user_id', mobileUser.id).order('is_default', { ascending: false })
      .then(({ data }) => setAddresses(data ?? []));
  };

  useEffect(() => { load(); }, [mobileUser?.id]);

  const handleAdd = async () => {
    if (!form.receiver_name.trim() || !form.phone.trim() || !form.detail.trim()) {
      toast.error('请填写完整地址信息'); return;
    }
    setLoading(true);
    const { error } = await supabase.from('user_addresses').insert({
      user_id: mobileUser!.id,
      ...form,
      is_default: addresses.length === 0,
    });
    setLoading(false);
    if (error) { toast.error('添加失败'); return; }
    toast.success('地址已添加');
    setForm({ receiver_name: '', phone: '', province: '', city: '', district: '', detail: '' });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('user_addresses').delete().eq('id', id);
    load();
    toast.success('已删除');
  };

  const setDefault = async (id: string) => {
    await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', mobileUser!.id);
    await supabase.from('user_addresses').update({ is_default: true }).eq('id', id);
    load();
    toast.success('默认地址已更新');
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="收货地址" back />

      <div className="px-4 py-4 space-y-3">
        {addresses.map(addr => (
          <div key={addr.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{addr.receiver_name}</span>
                  <span className="text-sm text-muted-foreground">{addr.phone}</span>
                  {addr.is_default && (
                    <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">默认</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {addr.province}{addr.city}{addr.district}{addr.detail}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
              {!addr.is_default && (
                <button onClick={() => setDefault(addr.id)} className="text-xs text-primary">设为默认</button>
              )}
              <button onClick={() => handleDelete(addr.id)} className="text-xs text-destructive flex items-center gap-1 ml-auto">
                <Trash2 size={13} />删除
              </button>
            </div>
          </div>
        ))}

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full border-2 border-dashed border-border rounded-xl py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40"
          >
            <Plus size={16} />添加新地址
          </button>
        ) : (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {[
              { key: 'receiver_name', label: '收货人', placeholder: '请输入收货人姓名' },
              { key: 'phone', label: '手机号', placeholder: '请输入联系手机号' },
              { key: 'province', label: '省份', placeholder: '如：广东省' },
              { key: 'city', label: '城市', placeholder: '如：深圳市' },
              { key: 'district', label: '区县', placeholder: '如：南山区' },
              { key: 'detail', label: '详细地址', placeholder: '街道、楼栋、门牌号等' },
            ].map(field => (
              <div key={field.key}>
                <label className="text-xs text-muted-foreground block mb-1">{field.label}</label>
                <Input
                  placeholder={field.placeholder}
                  className="h-10"
                  value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10" onClick={() => setShowForm(false)}>取消</Button>
              <Button className="flex-1 h-10" onClick={handleAdd} disabled={loading}>{loading ? '保存中...' : '保存地址'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
