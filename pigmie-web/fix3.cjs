const fs = require('fs');

const colPath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/collections/pages/collections-today-page.tsx';
let colContent = fs.readFileSync(colPath, 'utf8');
colContent = colContent.replace(/catch \(err\)/g, 'catch (_err)');
colContent = colContent.replace(/catch \(err: any\)/g, 'catch (_err: any)');
fs.writeFileSync(colPath, colContent);

const loanPath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/loans/pages/loan-detail-page.tsx';
let loanContent = fs.readFileSync(loanPath, 'utf8');

const rejectBtn = `
              <Button 
                onClick={() => {
                  const reason = prompt('Enter rejection reason:');
                  if (reason) rejectLoan.mutate({ id: loan.id, reason });
                }}
                disabled={rejectLoan.isPending}
                className="bg-red-500/20 text-destructive hover:bg-red-500/30 border border-red-500/30 gap-2"
              >
                Reject
              </Button>`;

loanContent = loanContent.replace(/Approve\r?\n\s*<\/Button>/, "Approve\n              </Button>" + rejectBtn);
fs.writeFileSync(loanPath, loanContent);
console.log('Fixed loan detail page');
