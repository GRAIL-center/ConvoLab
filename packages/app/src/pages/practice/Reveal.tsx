import type { ReactNode } from 'react';
import { useInViewOnce } from './useInViewOnce';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export function Reveal({ children, className = '', delayMs = 0 }: RevealProps) {
  const { ref, inView } = useInViewOnce(0.18);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:transition-none ${
        inView ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0 motion-reduce:opacity-100'
      } ${className}`}
      style={inView && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
