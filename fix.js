const fs = require('fs');

function processFile(file, replacer) {
  const p = 'pigmie-web/src/' + file;
  if (!fs.existsSync(p)) { console.log('Missing: ' + p); return; }
  const orig = fs.readFileSync(p, 'utf8');
  const res = replacer(orig);
  if (orig !== res) {
    fs.writeFileSync(p, res, 'utf8');
    console.log('Updated: ' + p);
  } else {
    console.log('No change: ' + p);
  }
}

processFile('features/approvals/pages/approvals-page.tsx', s => s.replace(/,\s*TabsContent/, '').replace(/TabsContent,\s*/, ''));
processFile('features/auth/pages/setup-2fa-page.tsx', s => s.replace(/,\s*CardFooter/, '').replace(/CardFooter,\s*/, ''));
processFile('features/branches/pages/branches-page.tsx', s => s.replace(/,\s*CardHeader/, '').replace(/CardHeader,\s*/, '').replace(/,\s*CardTitle/, '').replace(/CardTitle,\s*/, '').replace(/,\s*GitBranch/, '').replace(/GitBranch,\s*/, ''));
processFile('features/collections/pages/record-collection-page.tsx', s => s.replace(/data,\s*/, ''));
processFile('features/customers/pages/customer-detail-page.tsx', s => {
  return s.replace(/,\s*CheckCircle/, '').replace(/CheckCircle,\s*/, '')
          .replace(/,\s*XCircle/, '').replace(/XCircle,\s*/, '')
          .replace(/user\?\.role === 'org_admin'/g, 'user?.userType === \'staff\' && user.role === \'org_admin\'');
});
processFile('features/customers/pages/customer-form-page.tsx', s => s.replace(/,\s*CardFooter/, '').replace(/CardFooter,\s*/, ''));
processFile('features/dashboard/components/due-today-table.tsx', s => s.replace(/import React(?:,\s*({[^}]+}))?\s+from 'react';/, (m, p1) => p1 ? 'import ' + p1 + ' from \'react\';' : ''));
processFile('features/dashboard/pages/dashboard-page.tsx', s => s.replace(/,\s*ReportSummary/, '').replace(/ReportSummary,\s*/, '').replace(/import \{ ReportSummary \} from '[^']+';\r?\n/, ''));
processFile('features/loan-products/pages/new-loan-product-page.tsx', s => s.replace(/import React(?:,\s*({[^}]+}))?\s+from 'react';/, (m, p1) => p1 ? 'import ' + p1 + ' from \'react\';' : ''));
processFile('features/settings/pages/settings-page.tsx', s => s.replace(/user,\s*/, ''));
processFile('features/staff/pages/staff-form-page.tsx', s => s.replace(/,\s*StaffRole/, '').replace(/StaffRole,\s*/, '').replace(/,\s*watch/, '').replace(/watch,\s*/, ''));
processFile('shared/components/error-boundary.tsx', s => s.replace(/import React(?:,\s*({[^}]+}))?\s+from 'react';/, (m, p1) => p1 ? 'import ' + p1 + ' from \'react\';' : ''));
processFile('shared/components/layout/header.tsx', s => s.replace(/,\s*Bell/, '').replace(/Bell,\s*/, ''));
processFile('shared/components/layout/sidebar.tsx', s => s.replace(/\s*const \{ t \} = useTranslation\(\);\r?\n/, '\n'));
processFile('shared/components/ui/dialog.tsx', s => s.replace(/,\s*Check/, '').replace(/Check,\s*/, '').replace(/,\s*ChevronRight/, '').replace(/ChevronRight,\s*/, '').replace(/,\s*Circle/, '').replace(/Circle,\s*/, ''));
processFile('shared/components/ui/dropdown-menu.tsx', s => s.replace(/,\s*X/, '').replace(/X,\s*/, ''));
processFile('shared/components/ui/empty-state.tsx', s => s.replace(/import React(?:,\s*({[^}]+}))?\s+from 'react';/, (m, p1) => p1 ? 'import ' + p1 + ' from \'react\';' : ''));
processFile('shared/components/ui/toast.tsx', s => s.replace(/,\s*Check/, '').replace(/Check,\s*/, '').replace(/,\s*ChevronRight/, '').replace(/ChevronRight,\s*/, '').replace(/,\s*Circle/, '').replace(/Circle,\s*/, ''));

['shared/lib/api-client.ts', 'shared/lib/supabase.ts'].forEach(f => {
  const p = 'pigmie-web/src/' + f;
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes('vite/client')) {
    fs.writeFileSync(p, '/// <reference types=\"vite/client\" />\n' + s, 'utf8');
    console.log('Added reference to ' + p);
  }
});
