import React, { useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/shared/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Upload, X, Check, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface CustomerCSVRow {
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
}

export const ImportCustomersPage = () => {
  const [data, setData] = useState<CustomerCSVRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);

    Papa.parse<CustomerCSVRow>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validRows = results.data.filter(row => row.fullName && row.phone);
        if (validRows.length !== results.data.length) {
          toast.warning(`Skipped ${results.data.length - validRows.length} rows with missing required fields (fullName, phone).`);
        }
        setData(validRows);
        setIsParsing(false);
      },
      error: (error) => {
        toast.error(`Error parsing CSV: ${error.message}`);
        setIsParsing(false);
      }
    });
  };

  const importMutation = useMutation({
    mutationFn: async (customers: CustomerCSVRow[]) => {
      const res = await api.post('/customers/bulk', { customers });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Successfully imported ${data.successCount} customers.`);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/app/customers');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to import customers');
    }
  });

  const handleImport = () => {
    if (data.length === 0) return;
    importMutation.mutate(data);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Import Customers</h1>
        <p className="text-muted-foreground mt-1 text-zinc-400">Upload a CSV file to bulk import customers.</p>
      </div>

      <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        {!file && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-900/30">
            <Upload className="w-10 h-10 text-zinc-500 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Upload CSV File</h3>
            <p className="text-sm text-zinc-400 mb-6 text-center max-w-sm">
              Ensure your CSV has the following headers: <br/> <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">fullName</code>, <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">phone</code>, <code className="text-zinc-300">email</code>, <code className="text-zinc-300">address</code>
            </p>
            <div className="relative">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button>Select File</Button>
            </div>
          </div>
        )}

        {isParsing && (
          <div className="flex justify-center items-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {file && !isParsing && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-white">{file.name}</h4>
                  <p className="text-sm text-zinc-400">{data.length} valid rows found</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setFile(null); setData([]); }}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={data.length === 0 || importMutation.isPending}
                >
                  {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirm Import
                </Button>
              </div>
            </div>

            {data.length > 0 && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-zinc-800/50 sticky top-0 z-10">
                      <TableRow className="border-zinc-800">
                        <TableHead className="text-zinc-400">Full Name</TableHead>
                        <TableHead className="text-zinc-400">Phone</TableHead>
                        <TableHead className="text-zinc-400">Email</TableHead>
                        <TableHead className="text-zinc-400">Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, i) => (
                        <TableRow key={i} className="border-zinc-800">
                          <TableCell className="font-medium text-white">{row.fullName}</TableCell>
                          <TableCell className="text-zinc-300">{row.phone}</TableCell>
                          <TableCell className="text-zinc-400">{row.email || '-'}</TableCell>
                          <TableCell className="text-zinc-400">{row.address || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
