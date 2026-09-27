import { useStaff, StaffMember, StaffRole, StaffStatus } from '../hooks/use-staff';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Plus, MoreVertical, Shield, User, Users, Calculator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/components/ui/empty-state';

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

export function StaffPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization's staff members and their roles.
          </p>
        </div>
        <Button className="shrink-0 gap-2" asChild>
          <Link to="/app/staff/new">
            <Plus className="h-4 w-4" />
            Add Staff Member
          </Link>
        </Button>
      </div>

      <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
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
            <div className="rounded-md border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => {
                    const RoleIcon = roleIcons[member.role] || User;
                    return (
                      <TableRow key={member.id} className="border-white/10 hover:bg-white/5">
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{member.name}</span>
                            <span className="text-xs text-muted-foreground">{member.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <RoleIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{member.role}</span>
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
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
