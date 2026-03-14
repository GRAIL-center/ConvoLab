import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon';
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', children, ...props }, ref) => {
    const baseStyles = 'rounded-full px-6 py-3 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variantStyles = {
      // Sage green for primary actions
      primary: 'bg-[rgba(212,232,229,0.25)] hover:bg-[rgba(212,232,229,0.35)] active:bg-[rgba(212,232,229,0.35)] text-white focus:ring-[rgba(212,232,229,0.25)] dark:bg-[rgba(212,232,229,0.25)] dark:hover:bg-[rgba(212,232,229,0.35)]',
      
      // Teal for coach actions (matches your existing teal colors)
      secondary: 'bg-[rgba(134,199,194,0.2)] hover:bg-[rgba(134,199,194,0.3)] active:bg-[rgba(134,199,194,0.3)] text-[rgba(50,130,120,1)] border border-[rgba(134,199,194,0.6)] focus:ring-[rgba(134,199,194,0.3)] dark:text-[rgba(134,199,194,0.9)] dark:border-[rgba(134,199,194,0.3)]',
      
      // Icon button
      icon: 'p-3 bg-[rgba(212,232,229,0.15)] hover:bg-[rgba(212,232,229,0.25)] active:bg-[rgba(212,232,229,0.25)] text-[rgba(212,232,229,0.9)] focus:ring-[rgba(212,232,229,0.15)]'
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
