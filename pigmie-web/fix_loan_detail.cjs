const fs = require('fs');

const loanPath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/loans/pages/loan-detail-page.tsx';
let loanContent = fs.readFileSync(loanPath, 'utf8');

// 1. Text color red-400 -> destructive
loanContent = loanContent.replace(/text-red-400/g, 'text-destructive');

// 2. Imports and hooks
if (!loanContent.includes('useRejectLoan')) {
    loanContent = loanContent.replace('useApproveLoan, useDisburseLoan, useLoanSchedule, useMarkDefaultLoan', 'useApproveLoan, useDisburseLoan, useLoanSchedule, useMarkDefaultLoan, useRejectLoan, useWriteOffLoan');
}
if (!loanContent.includes('rejectLoan =')) {
    loanContent = loanContent.replace('const approveLoan = useApproveLoan();', 'const approveLoan = useApproveLoan();\n  const rejectLoan = useRejectLoan();\n  const writeOffLoan = useWriteOffLoan();');
}

// 3. Add buttons properly
// Replace Approve section:
const searchApprove = `{loan.status === 'pending_approval' && (
              <Button 
                onClick={() => approveLoan.mutate(loan.id)}
                disabled={approveLoan.isPending}
                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 gap-2"
              >
                {approveLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <CheckCircle className="h-4 w-4" />}
                Approve
              </Button>
            )}`;

const replaceApprove = `{loan.status === 'pending_approval' && (
              <>
                <Button 
                  onClick={() => approveLoan.mutate(loan.id)}
                  disabled={approveLoan.isPending}
                  className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 gap-2"
                >
                  {approveLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <CheckCircle className="h-4 w-4" />}
                  Approve
                </Button>
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
              </>
            )}`;

loanContent = loanContent.replace(searchApprove, replaceApprove);
// Wait, CRLF could prevent searchApprove from matching. Let's make it regex-based robustly.

const approveRegex = /\{loan\.status === 'pending_approval' && \(\s*<Button\s*onClick=\{\(\) => approveLoan\.mutate\(loan\.id\)\}\s*disabled=\{approveLoan\.isPending\}\s*className="bg-emerald-500\/20 text-emerald-400 hover:bg-emerald-500\/30 border border-emerald-500\/30 gap-2"\s*>\s*\{approveLoan\.isPending \? <LoadingSpinner className="w-4 h-4" \/> : <CheckCircle className="w-4 h-4" \/>\}\s*Approve\s*<\/Button>\s*\)\}/;
loanContent = loanContent.replace(approveRegex, replaceApprove);

const defaultBtnRegex = /<Button\s*onClick=\{\(\) => \{\s*if \(window\.confirm\('Are you sure you want to mark this loan as defaulted\?'\)\) \{\s*markDefaultLoan\.mutate\(loan\.id\);\s*\}\s*\}\}\s*disabled=\{markDefaultLoan\.isPending\}\s*className="bg-yellow-500\/20 text-yellow-400 hover:bg-yellow-500\/30 border border-yellow-500\/30 gap-2"\s*>\s*\{markDefaultLoan\.isPending \? <LoadingSpinner className="w-4 h-4" \/> : <AlertTriangle className="w-4 h-4" \/>\}\s*Mark Default\s*<\/Button>/;

const replaceDefaultAndWriteOff = `<Button 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to mark this loan as defaulted?')) {
                      markDefaultLoan.mutate(loan.id);
                    }
                  }}
                  disabled={markDefaultLoan.isPending}
                  className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30 gap-2"
                >
                  {markDefaultLoan.isPending ? <LoadingSpinner className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  Mark Default
                </Button>
                <Button 
                  onClick={() => {
                    const reason = prompt('Enter write-off reason:');
                    if (reason) writeOffLoan.mutate({ id: loan.id, reason });
                  }}
                  disabled={writeOffLoan.isPending}
                  className="bg-red-500/20 text-destructive hover:bg-red-500/30 border border-red-500/30 gap-2"
                >
                  Write Off
                </Button>`;

loanContent = loanContent.replace(defaultBtnRegex, replaceDefaultAndWriteOff);

fs.writeFileSync(loanPath, loanContent);
console.log('Fixed loan detail page perfectly');
