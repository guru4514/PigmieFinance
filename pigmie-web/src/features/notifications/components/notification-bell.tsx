import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { apiClient } from '@/shared/lib/api-client';

import { urlBase64ToUint8Array } from '@/shared/lib/utils';

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiClient.notifications.getNotifications(),
    refetchOnWindowFocus: true,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.notifications.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  const handleEnablePush = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission === 'granted') {
          // Register service worker explicitly first to avoid hanging ready promise
          const swRegistration = await navigator.serviceWorker.register('/service-worker.js');
          const registration = await navigator.serviceWorker.ready;
          const { publicKey } = await apiClient.notifications.getVapidPublicKey();
          
          const existingSubscription = await registration.pushManager.getSubscription();
          if (!existingSubscription) {
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            await apiClient.notifications.subscribe(subscription.toJSON());
          }
        }
      } catch (err) {
        console.error('Push registration failed:', err);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full"></span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 border-border bg-zinc-950 text-foreground">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start px-4 py-3 cursor-pointer border-b border-border last:border-0 rounded-none focus:bg-muted ${!notification.read ? 'bg-muted' : ''}`}
                onClick={(e) => {
                  e.preventDefault(); // keep dropdown open if preferred, or remove to close
                  if (!notification.read) {
                    markAsReadMutation.mutate(notification.id);
                  }
                }}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="mt-1 shrink-0">
                    {!notification.read ? (
                      <span className="block w-2 h-2 bg-indigo-500 rounded-full"></span>
                    ) : (
                      <span className="block w-2 h-2 rounded-full border border-border"></span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    <span className="font-medium text-sm leading-none">{notification.title}</span>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
      {permissionState === 'default' && (
        <DropdownMenuContent align="end" className="w-80 p-3 mt-2 border-border bg-zinc-950 text-foreground">
          <Button onClick={handleEnablePush} className="w-full bg-indigo-600 hover:bg-indigo-700 text-foreground">
            Enable Push Notifications
          </Button>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
