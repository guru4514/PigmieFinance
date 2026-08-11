import React, { useRef, useState } from 'react';
import { useDocuments, useUploadDocument, useDownloadDocument, DocumentType } from '../../documents/hooks/use-documents';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { FileText, UploadCloud, Download, Trash2, Loader2, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';

export function CustomerDocuments({ customerId }: { customerId: string }) {
  const { data: documents, isLoading } = useDocuments('customer', customerId);
  const uploadDoc = useUploadDocument('customer', customerId);
  const downloadDoc = useDownloadDocument();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>('kyc_id');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      await uploadDoc.mutateAsync({ file: selectedFile, documentType: selectedType });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error("Upload failed", error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-white mb-4">Upload New Document</h3>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <label className="text-sm text-zinc-400">Document Type</label>
              <Select value={selectedType} onValueChange={(val: any) => setSelectedType(val)}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kyc_id">ID Proof (Aadhar/Passport)</SelectItem>
                  <SelectItem value="kyc_address">Address Proof (Utility Bill)</SelectItem>
                  <SelectItem value="kyc_photo">Photograph</SelectItem>
                  <SelectItem value="loan_agreement">Loan Agreement</SelectItem>
                  <SelectItem value="other">Other Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 flex-1">
              <label className="text-sm text-zinc-400">Select File</label>
              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="image/*,application/pdf"
                />
                <Button 
                  variant="outline" 
                  className="w-full bg-white/5 border-white/10 justify-start"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="w-4 h-4 mr-2 text-zinc-400" />
                  {selectedFile ? selectedFile.name : 'Choose file...'}
                </Button>
              </div>
            </div>
            
            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground" 
              disabled={!selectedFile || uploadDoc.isPending}
              onClick={handleUpload}
            >
              {uploadDoc.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                'Upload'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 flex justify-center"><LoadingSpinner className="w-6 h-6 text-primary" /></div>
          ) : !documents || documents.length === 0 ? (
            <div className="p-12 text-center text-zinc-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {documents.map((doc: any) => (
                <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <FileIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{doc.originalName}</p>
                      <p className="text-xs text-zinc-500 capitalize">
                        {doc.documentType.replace('_', ' ')} • {(doc.size / 1024).toFixed(0)} KB • {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                      onClick={() => downloadDoc.mutate(doc.id)}
                      disabled={downloadDoc.isPending}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
