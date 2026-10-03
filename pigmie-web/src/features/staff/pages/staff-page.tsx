import { useState } from 'react';
import { useStaff, useUpdateStaff, useDeleteStaff, StaffMember, StaffRole, StaffStatus } from '../hooks/use-staff';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Plus, MoreVertical, Shield, User, Users, Calculator, Edit, PowerOff, Trash } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { RoleGate } from '@/shared/components/auth/role-gate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Input } from '@/shared/components/ui/input';
import { useTranslation } from 'react-i18next';

const roleIcons: Record<string, React.ElementType> = {
  org_admin: Shield,
  branch_manager: Users,
  agent: User,
  accountant: Calculator,
};

const statusColors: Record<StaffStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  suspended: 'destructive',
};

function StaffRowActions({ member }: { member: StaffMember }) {
  const { t } = useTranslation();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole>(member.role);

  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: member.fullName, email: member.email || '' });

  const handleUpdateProfile = () => {
    updateStaff.mutate({ id: member.id, data: { fullName: profileForm.fullName, email: profileForm.email } }, {
      onSuccess: () => setIsEditProfileOpen(false)
    });
  };

  const handleDeactivate = () => {
    if (confirm(`Are you sure you want to deactivate ${member.fullName}?`)) {
      updateStaff.mutate({ id: member.id, data: { status: 'inactive' } });
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${member.fullName}? This cannot be undone.`)) {
      deleteStaff.mutate(member.id);
    }
  };

  const handleUpdateRole = () => {
    updateStaff.mutate({ id: member.id, data: { role: selectedRole } });
    setIsEditRoleOpen(false);
  };

  return (
    <>
      <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditProfileOpen(true)}>
              <User className="mr-2 h-4 w-4" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditRoleOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Role
            </DropdownMenuItem>
            {member.status === 'active' && (
              <DropdownMenuItem onClick={handleDeactivate}>
                <PowerOff className="mr-2 h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-red-500 focus:text-red-500 focus:bg-red-500/10">
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </RoleGate>

      <Dialog open={isEditRoleOpen} onOpenChange={setIsEditRoleOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Edit Role for {member.fullName}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Select Role</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as StaffRole)}>
                <SelectTrigger className="w-full bg-card border-border text-foreground">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="org_admin">Organization Admin</SelectItem>
                  <SelectItem value="branch_manager">Branch Manager</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditRoleOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRole} disabled={updateStaff.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {updateStaff.isPending ? <LoadingSpinner className="h-4 w-4" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Edit Profile for {member.fullName}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Full Name</label>
              <Input 
                value={profileForm.fullName} 
                onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80"> {t('staff.email')} </label>
              <Input 
                type="email"
                value={profileForm.email} 
                onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditProfileOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateProfile} disabled={updateStaff.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {updateStaff.isPending ? <LoadingSpinner className="h-4 w-4" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  const { data: staffResponse, isLoading, error } = useStaff();
  const staff = staffResponse?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <LoadingSpinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-red-500">
        Error loading staff: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Staff Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization's staff members and their roles.
          </p>
        </div>
        <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
          <Button className="shrink-0 gap-2" asChild>
            <Link to="/app/staff/new">
              <Plus className="h-4 w-4" />
              Add Staff Member
            </Link>
          </Button>
        </RoleGate>
      </div>

      <Card className="border-border bg-card backdrop-blur-xl">
        <CardHeader>
          <CardTitle>All Staff Members</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No staff members yet"
              description="Add your first staff member to start managing your organization."
              actionLabel="Add Staff Member"
              actionHref="/app/staff/new"
            />
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-muted">
                    <TableHead> {t('staff.name')} </TableHead>
                    <TableHead> {t('staff.role')} </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member: StaffMember) => {
                    const RoleIcon = roleIcons[member.role] || User;
                    return (
                      <TableRow key={member.id} className="border-border hover:bg-muted">
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{member.fullName}</span>
                            <span className="text-xs text-muted-foreground">{member.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <RoleIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{member.role.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[member.status]} className="capitalize">
                            {member.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <StaffRowActions member={member} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

