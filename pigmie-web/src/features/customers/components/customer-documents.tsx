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
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Upload New Document</h3>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <label className="text-sm text-muted-foreground">Document Type</label>
              <Select value={selectedType} onValueChange={(val: any) => setSelectedType(val)}>
                <SelectTrigger className="bg-white/5 border-border">
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
              <label className="text-sm text-muted-foreground">Select File</label>
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
                  className="w-full bg-white/5 border-border justify-start"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="w-4 h-4 mr-2 text-muted-foreground" />
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

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 flex justify-center"><LoadingSpinner className="w-6 h-6 text-primary" /></div>
          ) : !documents || documents.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {documents.map((doc: any) => (
                <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-muted transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      <FileIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.originalName}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {doc.documentType.replace('_', ' ')} • {(doc.size / 1024).toFixed(0)} KB • {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-foreground hover:bg-muted"
                      onClick={() => downloadDoc.mutate(doc.id)}
                      disabled={downloadDoc.isPending}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
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
