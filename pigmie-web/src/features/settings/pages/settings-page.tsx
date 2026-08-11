import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Save, Building2, Bell, ShieldCheck } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your platform preferences and configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-3">
          <nav className="flex flex-col space-y-1">
            <Button variant="secondary" className="justify-start gap-2">
              <Building2 className="h-4 w-4" />
              Organization
            </Button>
            <Button variant="ghost" className="justify-start gap-2 hover:bg-white/5">
              <Bell className="h-4 w-4" />
              Notifications
            </Button>
            <Button variant="ghost" className="justify-start gap-2 hover:bg-white/5">
              <ShieldCheck className="h-4 w-4" />
              Security
            </Button>
          </nav>
        </div>

        <div className="md:col-span-9 space-y-6">
          <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Organization Profile</CardTitle>
              <CardDescription>
                Update your company details and basic information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-200">Organization Name</label>
                <Input defaultValue="Pigmie Finance Ltd." className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-200">Support Email</label>
                <Input defaultValue="support@pigmie.com" type="email" className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-200">Contact Number</label>
                <Input defaultValue="+1 (555) 123-4567" type="tel" className="bg-white/5 border-white/10" />
              </div>
              
              <div className="pt-4 flex justify-end">
                <Button className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
