const fs = require('fs');
const path = require('path');

const srcDir = path.join('d:', 'AntiGravity', 'Projects', 'PigmieFinance', 'pigmie-web', 'src');

function updateFile(filePath, replacer) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = replacer(content);
    fs.writeFileSync(filePath, content);
    console.log('Updated ' + filePath);
}

// 1. use-loans.ts
updateFile(path.join(srcDir, 'features', 'loans', 'hooks', 'use-loans.ts'), (content) => {
    return content
        .replace(/mutationFn: \(id: string\) => apiClient\.post\(`\/loans\/\$\{id\}\/reject`\)\.then\(r => r\.data\)/, 'mutationFn: ({ id, reason }: { id: string; reason: string }) => apiClient.post(`/loans/${id}/reject`, { reason }).then(r => r.data)')
        .replace(/onSuccess: \(_, id\) => {\s+queryClient\.invalidateQueries\({ queryKey: \['loans'\] }\);\s+queryClient\.invalidateQueries\({ queryKey: \['loans', id\] }\);\s+toast\.success\('Loan rejected'\);\s+}/, 'onSuccess: (_, variables) => {\n      queryClient.invalidateQueries({ queryKey: [\'loans\'] });\n      queryClient.invalidateQueries({ queryKey: [\'loans\', variables.id] });\n      toast.success(\'Loan rejected\');\n    }')
        .replace(/mutationFn: \(id: string\) => apiClient\.post\(`\/loans\/\$\{id\}\/write-off`\)\.then\(r => r\.data\)/, 'mutationFn: ({ id, reason }: { id: string; reason: string }) => apiClient.post(`/loans/${id}/write-off`, { reason }).then(r => r.data)')
        .replace(/onSuccess: \(_, id\) => {\s+queryClient\.invalidateQueries\({ queryKey: \['loans'\] }\);\s+queryClient\.invalidateQueries\({ queryKey: \['loans', id\] }\);\s+toast\.success\('Loan written off'\);\s+}/, 'onSuccess: (_, variables) => {\n      queryClient.invalidateQueries({ queryKey: [\'loans\'] });\n      queryClient.invalidateQueries({ queryKey: [\'loans\', variables.id] });\n      toast.success(\'Loan written off\');\n    }');
});

// 2. loan-detail-page.tsx
updateFile(path.join(srcDir, 'features', 'loans', 'pages', 'loan-detail-page.tsx'), (content) => {
    let newContent = content;
    // Add useRejectLoan, useWriteOffLoan to imports if not there
    if (!newContent.includes('useRejectLoan')) {
        newContent = newContent.replace('useApproveLoan, useDisburseLoan, useLoanSchedule, useMarkDefaultLoan', 'useApproveLoan, useDisburseLoan, useLoanSchedule, useMarkDefaultLoan, useRejectLoan, useWriteOffLoan');
    }
    
    // Add hooks
    if (!newContent.includes('rejectLoan =')) {
        newContent = newContent.replace('const approveLoan = useApproveLoan();', 'const approveLoan = useApproveLoan();\n  const rejectLoan = useRejectLoan();\n  const writeOffLoan = useWriteOffLoan();');
    }

    // Add buttons. Find where Approve is
    const approveButtonRegex = /\{loan\.status === 'pending_approval' && \(\s+<Button[\s\S]*?Approve\s+<\/Button>\s+\)\}/;
    if (approveButtonRegex.test(newContent) && !newContent.includes('Reject')) {
        newContent = newContent.replace(approveButtonRegex, (match) => {
            return match + `\n            {loan.status === 'pending_approval' && (
              <Button 
                onClick={() => {
                  const reason = prompt('Enter rejection reason:');
                  if (reason) rejectLoan.mutate({ id: loan.id, reason });
                }}
                disabled={rejectLoan.isPending}
                className="bg-red-500/20 text-destructive hover:bg-red-500/30 border border-red-500/30 gap-2"
              >
                Reject
              </Button>
            )}`;
        });
    }

    // Add write off button
    const defaultButtonRegex = /<Button[\s\S]*?Mark Default\s+<\/Button>/;
    if (defaultButtonRegex.test(newContent) && !newContent.includes('Write Off')) {
        newContent = newContent.replace(defaultButtonRegex, (match) => {
            return match + `\n                <Button 
                  onClick={() => {
                    const reason = prompt('Enter write-off reason:');
                    if (reason) writeOffLoan.mutate({ id: loan.id, reason });
                  }}
                  disabled={writeOffLoan.isPending}
                  className="bg-red-500/20 text-destructive hover:bg-red-500/30 border border-red-500/30 gap-2"
                >
                  Write Off
                </Button>`;
        });
    }

    return newContent;
});

// C7. Fix cash deposit verify payload
updateFile(path.join(srcDir, 'features', 'cash-deposits', 'pages', 'cash-deposits-page.tsx'), (content) => {
    let newContent = content;
    // H7. Add depositDate to payload
    if (!newContent.includes('depositDate: new Date().toISOString().split(\'T\')[0]')) {
        newContent = newContent.replace('mutationFn: (data: DepositFormValues) => apiClient.post(\'/cash-deposits\', data)', 'mutationFn: (data: DepositFormValues) => apiClient.post(\'/cash-deposits\', { ...data, depositDate: new Date().toISOString().split(\'T\')[0] })');
    }
    
    // C7. verify payload
    newContent = newContent.replace('mutationFn: (id: string) => apiClient.post(`/cash-deposits/${id}/verify`)', 'mutationFn: (id: string) => apiClient.post(`/cash-deposits/${id}/verify`, { status: \'verified\' })');

    // H8. reconciliation date params
    if (!newContent.includes('startDate=')) {
        newContent = newContent.replace('const res = await apiClient.get(\'/cash-deposits/reconciliation\');', 'const today = new Date().toISOString().split(\'T\')[0];\n      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split(\'T\')[0];\n      const res = await apiClient.get(`/cash-deposits/reconciliation?startDate=${thirtyDaysAgo}&endDate=${today}`);');
    }
    return newContent;
});

// H4. Fix loan product enum 'reducing' -> 'reducing_balance'
function replaceAllInFiles(dir, matchStr, replaceStr) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceAllInFiles(fullPath, matchStr, replaceStr);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(matchStr)) {
                content = content.split(matchStr).join(replaceStr);
                fs.writeFileSync(fullPath, content);
                console.log('Replaced in ' + fullPath);
            }
        }
    }
}
// H5. Fix customer type: status -> isActive
function fixCustomerStatus(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            fixCustomerStatus(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;
            // careful with `.status` replacement, only where it's clearly a customer
            if (content.match(/customer\.status/)) {
                content = content.replace(/customer\.status/g, 'customer.isActive');
                changed = true;
            }
            if (content.match(/status:\s*'active'\s*\|\s*'inactive'\s*\|\s*'pending'/)) {
                content = content.replace(/status:\s*'active'\s*\|\s*'inactive'\s*\|\s*'pending'/, 'isActive: boolean');
                changed = true;
            }
            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed customer status in ' + fullPath);
            }
        }
    }
}
fixCustomerStatus(srcDir);

// H6. Fix reports date params
updateFile(path.join(srcDir, 'features', 'reports', 'hooks', 'use-reports.ts'), (content) => {
    return content.replace(/startDate/g, 'dateFrom').replace(/endDate/g, 'dateTo');
});

// H10. Add 404 page
updateFile(path.join(srcDir, 'App.tsx'), (content) => {
    if (content.includes('<Route path="*"')) return content;
    return content.replace('</Routes>', `  <Route path="*" element={
          <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
            <p className="text-xl text-muted-foreground mt-4">Page not found</p>
            <Link to="/app/dashboard" className="mt-6 text-primary hover:underline">Go to Dashboard</Link>
          </div>
        } />
      </Routes>`);
});

// M2. Add 401 retry interceptor
updateFile(path.join(srcDir, 'shared', 'lib', 'api-client.ts'), (content) => {
    if (content.includes('401')) return content;
    let newContent = content;
    if (!newContent.includes('import { supabase }')) {
        newContent = "import { supabase } from './supabase';\n" + newContent;
    }
    newContent += `
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) {
        error.config.headers.Authorization = \`Bearer \${data.session.access_token}\`;
        return apiClient(error.config);
      }
    }
    return Promise.reject(error);
  }
);
`;
    return newContent;
});

// M6. Fix phone validation
updateFile(path.join(srcDir, 'features', 'customers', 'pages', 'customer-form-page.tsx'), (content) => {
    return content.replace(/phone:\s*z\.string\(\)\.min\(10.*?\)/, "phone: z.string().regex(/^[6-9]\\d{9}$/, 'Enter a valid 10-digit Indian phone number')");
});

// M7. Fix validation error text color
function fixTextColor(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            fixTextColor(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('text-red-400')) {
                content = content.replace(/text-red-400/g, 'text-destructive');
                fs.writeFileSync(fullPath, content);
                console.log('Fixed text color in ' + fullPath);
            }
        }
    }
}
fixTextColor(srcDir);

// M8. Fix portal link
updateFile(path.join(srcDir, 'features', 'portal', 'pages', 'portal-dashboard-page.tsx'), (content) => {
    return content.replace(/\/app\/portal\/loans\/\$\{loan\.id\}/g, '/portal/loans/${loan.id}');
});
