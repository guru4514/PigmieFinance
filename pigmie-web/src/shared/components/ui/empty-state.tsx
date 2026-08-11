import React from 'react';
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
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-white/10 rounded-xl bg-white/5 mt-8">
      <div className="p-4 rounded-full bg-white/5 mb-4 text-gray-500">
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 max-w-md mb-6">{description}</p>
      
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
