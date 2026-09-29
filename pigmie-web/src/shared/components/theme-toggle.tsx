import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useLayoutEffect, useState } from 'react';
import { getTheme, toggleTheme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  useLayoutEffect(() => {
    setThemeState(getTheme());
  }, []);

  const handleToggle = () => {
    const newTheme = toggleTheme();
    setThemeState(newTheme);
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleToggle} 
      className="text-muted-foreground hover:text-foreground" 
      title="Toggle theme"
    >
      {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </Button>
  );
}
