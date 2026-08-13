import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCustomer } from '../hooks/use-customers';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { ArrowLeft, User, FileText, CreditCard, Mail, Phone, Calendar, MapPin } from 'lucide-react';
import { CustomerDocuments } from '../components/customer-documents';
import { RoleGate } from '@/shared/components/auth/role-gate';

export const CustomerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: customerRes, isLoading } = useCustomer(id || '');
  const customer = customerRes?.data || customerRes; // handle wrapped response or direct
  const [activeTab, setActiveTab] = useState<'profile' | 'loans' | 'documents'>('profile');

  if (isLoading || !customer) {
    return (
      <div className="flex h-full items-center justify-center min-h-[400px]">
        <LoadingSpinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/app/customers">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            {customer.fullName}
            <Badge 
              variant="default"
              className={customer.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 'bg-zinc-800 text-zinc-400'}
            >
              {customer.status}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1 text-zinc-400">Customer ID: {customer.id}</p>
        </div>
        <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
          <Link to={`/app/customers/${customer.id}/edit`}>
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Edit Profile
            </Button>
          </Link>
        </RoleGate>
      </div>

      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'profile' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2"><User className="w-4 h-4" /> Profile</div>
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'loans' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Loans</div>
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'documents' ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2"><FileText className="w-4 h-4" /> Documents</div>
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg text-white">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 text-zinc-300">
                  <Mail className="w-5 h-5 text-zinc-500" />
                  <span>{customer.email || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-300">
                  <Phone className="w-5 h-5 text-zinc-500" />
                  <span>{customer.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-300">
                  <MapPin className="w-5 h-5 text-zinc-500" />
                  <span>{customer.address || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-zinc-300">
                  <Calendar className="w-5 h-5 text-zinc-500" />
                  <span>Joined {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg text-white">Financial Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-zinc-800/50">
                    <span className="text-zinc-400">Total Loans</span>
                    <span className="text-white font-medium">{customer.totalLoans || 0}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-zinc-800/50">
                    <span className="text-zinc-400">Outstanding Balance</span>
                    <span className="text-white font-medium">₹0</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-zinc-400">Credit Score</span>
                    <span className="text-emerald-400 font-medium">N/A</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'loans' && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-12 text-center text-zinc-500">
              <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active loans found for this customer.</p>
              <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
                <Link to="/app/loans/new">
                  <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300">Issue New Loan</Button>
                </Link>
              </RoleGate>
            </CardContent>
          </Card>
        )}

        {activeTab === 'documents' && (
          <CustomerDocuments customerId={customer.id} />
        )}
      </div>
    </div>
  );
};
