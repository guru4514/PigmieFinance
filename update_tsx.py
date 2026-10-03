import os
import re

files_and_replacements = {
    "pigmie-web/src/features/loans/pages/loan-detail-page.tsx": [
        (r">Loan Details<", "> {t('loans.details')} <"),
        (r">Principal Amount<", "> {t('loans.principalAmount')} <"),
        (r">Remaining Balance<", "> {t('loans.remainingBalance')} <"),
        (r">Interest Rate<", "> {t('loans.interestRate')} <"),
        (r">Tenure<", "> {t('loans.tenure')} <"),
        (r">Start Date<", "> {t('loans.startDate')} <"),
        (r">End Date<", "> {t('loans.endDate')} <"),
        (r">Next Payment<", "> {t('loans.nextPayment')} <"),
        (r">Overview<", "> {t('loans.overview')} <"),
        (r">Schedule<", "> {t('loans.schedule')} <"),
        (r">Collections<", "> {t('loans.collections')} <"),
        (r">Documents<", "> {t('loans.documents')} <"),
        (r">Approve<", "> {t('loans.approve')} <"),
        (r">Disburse<", "> {t('loans.disburse')} <"),
        (r">Restructure<", "> {t('loans.restructure')} <")
    ],
    "pigmie-web/src/features/loans/pages/new-loan-page.tsx": [
        (r">New Loan Application<", "> {t('loans.newApplication')} <"),
        (r">Select Customer<", "> {t('loans.selectCustomer')} <"),
        (r">Select Product<", "> {t('loans.selectProduct')} <"),
        (r">Principal Amount<", "> {t('loans.principalAmount')} <"),
        (r">Tenure<", "> {t('loans.tenure')} <"),
        (r">Submit<", "> {t('loans.submit')} <")
    ],
    "pigmie-web/src/features/loans/pages/emi-calculator-page.tsx": [
        (r">EMI Calculator<", "> {t('emi.title')} <"),
        (r">Monthly EMI<", "> {t('emi.monthlyEmi')} <"),
        (r">Total Interest<", "> {t('emi.totalInterest')} <"),
        (r">Total Payable<", "> {t('emi.totalPayable')} <")
    ],
    "pigmie-web/src/features/staff/pages/staff-page.tsx": [
        (r">Staff<", "> {t('staff.title')} <"),
        (r">Add Staff<", "> {t('staff.addStaff')} <"),
        (r">Name<", "> {t('staff.name')} <"),
        (r">Email<", "> {t('staff.email')} <"),
        (r">Role<", "> {t('staff.role')} <"),
        (r">Branch<", "> {t('staff.branch')} <"),
        (r">Actions<", "> {t('staff.actions')} <")
    ],
    "pigmie-web/src/features/staff/pages/staff-form-page.tsx": [
        (r">Add New Staff<", "> {t('staff.addStaff')} <"),
        (r">Full Name<", "> {t('customers.fullName')} <"),
        (r">Email<", "> {t('staff.email')} <"),
        (r">Role<", "> {t('staff.role')} <")
    ],
    "pigmie-web/src/features/approvals/pages/approvals-page.tsx": [
        (r">Approvals<", "> {t('approvals.title')} <"),
        (r">Pending<", "> {t('approvals.pending')} <"),
        (r">Approved<", "> {t('approvals.approved')} <"),
        (r">Rejected<", "> {t('approvals.rejected')} <"),
        (r">Review<", "> {t('approvals.review')} <")
    ],
    "pigmie-web/src/features/reports/pages/reports-page.tsx": [
        (r">Reports<", "> {t('reports.title')} <"),
        (r">Overview<", "> {t('reports.overview')} <"),
        (r">Overdue Loans<", "> {t('reports.overdueLoans')} <"),
        (r">Collection Efficiency<", "> {t('reports.collectionEfficiency')} <"),
        (r">Agent Performance<", "> {t('reports.agentPerformance')} <"),
        (r">Export<", "> {t('reports.export')} <")
    ],
    "pigmie-web/src/features/reports/pages/branch-comparison-page.tsx": [
        (r">Branch Comparison<", "> {t('reports.branchComparison')} <")
    ],
    "pigmie-web/src/features/settings/pages/settings-page.tsx": [
        (r">Settings<", "> {t('settings.title')} <"),
        (r">Organization Profile<", "> {t('settings.organizationProfile')} <"),
        (r">Notifications<", "> {t('settings.notifications')} <"),
        (r">SMS Config<", "> {t('settings.smsConfig')} <"),
        (r">Save<", "> {t('settings.save')} <")
    ],
    "pigmie-web/src/features/branches/pages/branches-page.tsx": [
        (r">Branches<", "> {t('branches.title')} <"),
        (r">Add Branch<", "> {t('branches.addBranch')} <"),
        (r">Name<", "> {t('staff.name')} <"),
        (r">Address<", "> {t('branches.address')} <"),
        (r">Status<", "> {t('branches.status')} <")
    ],
    "pigmie-web/src/features/cash-deposits/pages/cash-deposits-page.tsx": [
        (r">Cash Deposits<", "> {t('deposits.title')} <"),
        (r">Record Deposit<", "> {t('deposits.recordDeposit')} <"),
        (r">Verify<", "> {t('deposits.verify')} <"),
        (r">Amount<", "> {t('deposits.amount')} <")
    ],
    "pigmie-web/src/features/loan-products/pages/loan-products-page.tsx": [
        (r">Loan Products<", "> {t('loanProducts.title')} <"),
        (r">New Product<", "> {t('loanProducts.newProduct')} <"),
        (r">Interest Rate<", "> {t('loanProducts.interestRate')} <")
    ],
    "pigmie-web/src/features/loan-products/pages/new-loan-product-page.tsx": [
        (r">Create Loan Product<", "> {t('loanProducts.createProduct')} <")
    ],
    "pigmie-web/src/features/audit-logs/pages/audit-logs-page.tsx": [
        (r">Audit Logs<", "> {t('audit.title')} <"),
        (r">Action<", "> {t('audit.action')} <"),
        (r">Entity<", "> {t('audit.entity')} <"),
        (r">User<", "> {t('audit.user')} <"),
        (r">Timestamp<", "> {t('audit.timestamp')} <")
    ],
    "pigmie-web/src/features/customers/pages/customer-detail-page.tsx": [
        (r">Customer Details<", "> {t('customers.details')} <"),
        (r">Loans<", "> {t('customers.loans')} <"),
        (r">KYC Status<", "> {t('customers.kycStatus')} <")
    ],
    "pigmie-web/src/features/customers/pages/customer-form-page.tsx": [
        (r">Full Name<", "> {t('customers.fullName')} <"),
        (r">Phone<", "> {t('customers.phone')} <"),
        (r">Address<", "> {t('branches.address')} <")
    ],
    "pigmie-web/src/features/customers/pages/import-customers-page.tsx": [
        (r">Import Customers<", "> {t('customers.import')} <"),
        (r">Upload CSV<", "> {t('customers.uploadCsv')} <")
    ],
    "pigmie-web/src/features/auth/pages/login-page.tsx": [
        (r">Sign In<", "> {t('auth.signIn')} <"),
        (r">Email<", "> {t('auth.email')} <"),
        (r">Password<", "> {t('auth.password')} <"),
        (r">Forgot Password<", "> {t('auth.forgotPassword')} <"),
        (r">Sign in with Google<", "> {t('auth.signInGoogle')} <")
    ],
    "pigmie-web/src/features/auth/pages/signup-page.tsx": [
        (r">Create Account<", "> {t('auth.createAccount')} <"),
        (r">Organization Name<", "> {t('auth.orgName')} <")
    ],
    "pigmie-web/src/shared/components/layout/sidebar.tsx": [
        (r"Dashboard", "{t('nav.dashboard')}"),
        (r"Customers", "{t('nav.customers')}"),
        (r"Loans", "{t('nav.loans')}"),
        (r"Collections", "{t('nav.collections')}")
    ],
    "pigmie-web/src/shared/components/layout/mobile-bottom-nav.tsx": [
        (r"Home", "{t('nav.home')}"),
        (r"Customers", "{t('nav.customers')}"),
        (r"Collect", "{t('nav.collect')}"),
        (r"Loans", "{t('nav.loans')}"),
        (r"More", "{t('nav.more')}")
    ]
}

def inject_import(content):
    if "useTranslation" not in content:
        # Find last import
        import_match = list(re.finditer(r"^import .*$", content, re.MULTILINE))
        if import_match:
            last_import = import_match[-1]
            content = content[:last_import.end()] + "\nimport { useTranslation } from 'react-i18next';" + content[last_import.end():]
        else:
            content = "import { useTranslation } from 'react-i18next';\n" + content
    return content

def inject_hook(content):
    if "const { t } = useTranslation();" not in content:
        # Find default export function or const Component = 
        match = re.search(r"(export default function \w+\(.*?\)\s*\{|const \w+\s*=\s*\(.*?\)\s*=>\s*\{|export function \w+\(.*?\)\s*\{)", content)
        if match:
            content = content[:match.end()] + "\n  const { t } = useTranslation();" + content[match.end():]
    return content

for file_path, replacements in files_and_replacements.items():
    if not os.path.exists(file_path):
        print(f"Skipping {file_path}, does not exist")
        continue

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    content = inject_import(content)
    content = inject_hook(content)

    for old, new in replacements:
        if 'sidebar' in file_path or 'bottom-nav' in file_path:
            # For sidebar and nav, replace specific strings carefully
            content = re.sub(f"['\"]{old}['\"]", new, content)
        else:
            content = re.sub(old, new, content)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")

print("Done component updates")
