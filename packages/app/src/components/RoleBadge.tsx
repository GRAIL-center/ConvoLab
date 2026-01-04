type Role = 'GUEST' | 'USER' | 'STAFF' | 'ADMIN';

interface RoleBadgeProps {
  role: Role;
  size?: 'sm' | 'md';
}

const roleStyles: Record<Role, string> = {
  GUEST: 'bg-gray-100 text-gray-700',
  USER: 'bg-blue-100 text-blue-700',
  STAFF: 'bg-green-100 text-green-700',
  ADMIN: 'bg-amber-100 text-amber-700',
};

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
};

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${roleStyles[role]} ${sizeStyles[size]}`}
    >
      {role}
    </span>
  );
}
