
import { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-xl bg-muted mt-8">
      <div className="p-4 rounded-full bg-muted mb-4 text-muted-foreground">
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      
      {actionLabel && (
        actionHref ? (
          <Link to={actionHref}>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {actionLabel}
            </Button>
          </Link>
        ) : (
          <Button onClick={onAction} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}
