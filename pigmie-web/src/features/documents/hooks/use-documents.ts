import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { toast } from 'sonner';

export type DocumentType = 'kyc_id' | 'kyc_photo' | 'kyc_address' | 'loan_agreement' | 'other';
export type EntityType = 'customer' | 'loan';

export interface Document {
  id: string;
  entityType: EntityType;
  entityId: string;
  documentType: DocumentType;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  createdAt: string;
}

export const useDocuments = (entityType: EntityType, entityId: string) => {
  return useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => apiClient.get(`/documents/entity/${entityType}/${entityId}`).then(r => r.data),
    enabled: !!entityId,
  });
};

export const useUploadDocument = (entityType: EntityType, entityId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ file, documentType }: { file: File, documentType: DocumentType }) => {
      // 1. Get signed upload URL
      const { data: uploadInfo } = await apiClient.post('/documents/upload-url', {
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        documentType,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });

      // 2. Upload file directly to Supabase storage via PUT
      const uploadResponse = await fetch(uploadInfo.signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage bucket');
      }

      // 3. Register document in the database
      const { data: document } = await apiClient.post('/documents', {
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        documentType,
        filePath: uploadInfo.path,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });

      return document;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', entityType, entityId] });
      toast.success('Document uploaded successfully');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error.message || 'Failed to upload document');
    }
  });
};

export const useDownloadDocument = () => {
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await apiClient.get(`/documents/${documentId}/download-url`);
      return data.signedDownloadUrl;
    },
    onSuccess: (url) => {
      // Trigger download
      window.open(url, '_blank');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to download document');
    }
  });
};
