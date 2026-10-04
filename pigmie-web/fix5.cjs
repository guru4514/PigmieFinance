const fs = require('fs');

const loanPath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/loans/pages/loan-detail-page.tsx';
let loanContent = fs.readFileSync(loanPath, 'utf8');

// For Approve
const approveBlock = /{loan\.status === 'pending_approval' && \([\s\S]*?Approve\s*<\/Button>\s*\)\}/;
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

loanContent = loanContent.replace(approveBlock, replaceApprove);

// For Mark Default / Write Off
const defaultBlock = /<Button\s*onClick=\{\(\) => \{\s*if \(window\.confirm[\s\S]*?Mark Default\s*<\/Button>/;
const replaceDefault = `<Button 
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

loanContent = loanContent.replace(defaultBlock, replaceDefault);

fs.writeFileSync(loanPath, loanContent);
console.log('Fixed buttons');
