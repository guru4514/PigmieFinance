const fs = require('fs');
const filePath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/loans/pages/loan-detail-page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const searchRegex = /\{loan\.status === 'pending_approval' && \(\s*<Button\s*onClick=\{\(\) => approveLoan\.mutate\(loan\.id\)\}\s*disabled=\{approveLoan\.isPending\}\s*className="bg-emerald-500\/20 text-emerald-400 hover:bg-emerald-500\/30 border border-emerald-500\/30 gap-2"\s*>\s*\{approveLoan\.isPending \? <LoadingSpinner className="w-4 h-4" \/> : <CheckCircle className="w-4 h-4" \/>\}\s*Approve\s*<\/Button>\s*\)\}/;

const replace = `{loan.status === 'pending_approval' && (
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

content = content.replace(searchRegex, replace);
fs.writeFileSync(filePath, content);
console.log('Updated file');
