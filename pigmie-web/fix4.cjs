const fs = require('fs');

const loanPath = 'd:/AntiGravity/Projects/PigmieFinance/pigmie-web/src/features/loans/pages/loan-detail-page.tsx';
let loanContent = fs.readFileSync(loanPath, 'utf8');

const regex = /\{loan\.status === 'pending_approval' && \(\s*<Button[\s\S]*?Approve\s*<\/Button>\s*<Button[\s\S]*?Reject\s*<\/Button>\s*\)\}/;

loanContent = loanContent.replace(regex, (match) => {
    return match.replace('{loan.status === \'pending_approval\' && (', '{loan.status === \'pending_approval\' && (\n              <>').replace(')}', '  </>\n            )}');
});

fs.writeFileSync(loanPath, loanContent);
console.log('Fixed JSX fragment');
