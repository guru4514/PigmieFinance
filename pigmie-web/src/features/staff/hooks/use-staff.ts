import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

export type StaffRole = 'org_admin' | 'branch_manager' | 'agent' | 'accountant';
export type StaffStatus = 'active' | 'inactive' | 'suspended';

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  isActive?: boolean;
  joinedAt: string;
}

export const useStaff = (params?: Record<string, any>) => {
  return useQuery({
    queryKey: ['staff', params],
    queryFn: () => apiClient.get('/staff', { params }).then(r => r.data),
  });
};

import { toast } from 'sonner';

export const useCreateStaff = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<StaffMember>) => 
      apiClient.post('/staff', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member created successfully');
    },
    onError: (error: any) => toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to create staff member')
  });
};

export const useUpdateStaff = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StaffMember> }) => 
      apiClient.patch(`/staff/${id}`, data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member updated successfully');
    },
    onError: (error: any) => toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to update staff member')
  });
};

export const useDeleteStaff = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/staff/${id}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member deleted successfully');
    },
    onError: (error: any) => toast.error((error?.response?.data?.error?.message || (error?.response?.data?.error?.message || error?.response?.data?.message)) || 'Failed to delete staff member')
  });
};
