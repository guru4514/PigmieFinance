import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Calculator } from 'lucide-react';
import { calculateEMI, InterestType, CollectionFrequency, TenurePeriod } from '../utils/emi-calculator';

export const EMICalculatorPage: React.FC = () => {
  const [principal, setPrincipal] = useState<number>(10000);
  const [interestRate, setInterestRate] = useState<number>(12);
  const [tenure, setTenure] = useState<number>(12);
  const [tenurePeriod, setTenurePeriod] = useState<TenurePeriod>('months');
  const [collectionFrequency, setCollectionFrequency] = useState<CollectionFrequency>('monthly');
  const [interestType, setInterestType] = useState<InterestType>('flat');

  const result = useMemo(() => {
    return calculateEMI({
      principal: Number(principal) || 0,
      interestRate: Number(interestRate) || 0,
      tenure: Number(tenure) || 0,
      tenurePeriod,
      collectionFrequency,
      interestType
    });
  }, [principal, interestRate, tenure, tenurePeriod, collectionFrequency, interestType]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-4">
        <div className="bg-indigo-500/20 p-3 rounded-xl border border-indigo-500/30">
          <Calculator className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">EMI Calculator</h1>
          <p className="text-sm text-zinc-400 mt-1">Preview loan repayment schedule based on terms.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white">Loan Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Loan Amount (₹)</label>
                <Input
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="bg-zinc-800/50 border-zinc-700 text-white"
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Annual Interest Rate (%)</label>
                <Input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="bg-zinc-800/50 border-zinc-700 text-white"
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Tenure</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={tenure}
                    onChange={(e) => setTenure(Number(e.target.value))}
                    className="bg-zinc-800/50 border-zinc-700 text-white flex-1"
                    min={1}
                  />
                  <select
                    value={tenurePeriod}
                    onChange={(e) => setTenurePeriod(e.target.value as TenurePeriod)}
                    className="flex h-10 w-28 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Collection Frequency</label>
                <select
                  value={collectionFrequency}
                  onChange={(e) => setCollectionFrequency(e.target.value as CollectionFrequency)}
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Interest Type</label>
                <select
                  value={interestType}
                  onChange={(e) => setInterestType(e.target.value as InterestType)}
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="flat">Flat</option>
                  <option value="reducing_balance">Reducing Balance</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="text-sm font-medium text-zinc-400">Total Payable</div>
                <div className="text-2xl font-bold text-white mt-2">{formatCurrency(result.totalPayable)}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="text-sm font-medium text-zinc-400">Total Interest</div>
                <div className="text-2xl font-bold text-indigo-400 mt-2">{formatCurrency(result.totalInterest)}</div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="text-sm font-medium text-zinc-400">EMI / Installment</div>
                <div className="text-2xl font-bold text-emerald-400 mt-2">{formatCurrency(result.emi)}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white">Repayment Schedule</CardTitle>
              <CardDescription className="text-zinc-400">
                Detailed breakdown of each installment over the loan period.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.schedule.length > 0 ? (
                <div className="overflow-auto max-h-[500px] border border-zinc-800 rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-400 bg-zinc-900/80 sticky top-0 uppercase">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Principal</th>
                        <th className="px-4 py-3">Interest</th>
                        <th className="px-4 py-3">Total Installment</th>
                        <th className="px-4 py-3">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.schedule.map((item) => (
                        <tr key={item.installmentNumber} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                          <td className="px-4 py-3 font-medium text-zinc-300">{item.installmentNumber}</td>
                          <td className="px-4 py-3 text-white">{formatCurrency(item.principal)}</td>
                          <td className="px-4 py-3 text-white">{formatCurrency(item.interest)}</td>
                          <td className="px-4 py-3 text-white font-medium">{formatCurrency(item.total)}</td>
                          <td className="px-4 py-3 text-white">{formatCurrency(item.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-zinc-500">
                  Enter valid parameters to see the schedule.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
