import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTRPC } from '../../api/trpc';
import { RoleBadge } from '../../components/RoleBadge';

type Role = 'GUEST' | 'USER' | 'STAFF' | 'ADMIN';

function formatDate(date: Date | string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function UserList() {
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const trpc = useTRPC();

  const { data, isLoading, isError, isFetching, refetch } = useQuery(
    trpc.user.list.queryOptions({
      roleFilter: roleFilter || undefined,
      search: search || undefined,
      cursor,
      limit: 50,
    })
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setCursor(undefined); // Reset pagination on new search
  };

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  const handleClearFilters = () => {
    setRoleFilter('');
    setSearch('');
    setSearchInput('');
    setCursor(undefined);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500">Manage user accounts and roles</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Search
          </button>
        </form>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as Role | '');
            setCursor(undefined);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <option value="">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="STAFF">Staff</option>
          <option value="USER">User</option>
          <option value="GUEST">Guest</option>
        </select>

        {/* Clear filters */}
        {(roleFilter || search) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && <div className="py-12 text-center text-gray-500">Loading users...</div>}

      {/* Error state */}
      {isError && (
        <div className="py-12 text-center">
          <p className="text-red-600">Failed to load users</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-800"
          >
            Try again
          </button>
        </div>
      )}

      {/* User table */}
      {data && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="h-10 w-10 rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                          {user.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{user.name || 'Anonymous'}</div>
                        <div className="text-sm text-gray-500">
                          {user.email || <span className="italic text-gray-400">No email</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <RoleBadge role={user.role as Role} />
                    {!user.hasIdentity && user.role !== 'GUEST' && (
                      <span className="ml-2 text-xs text-gray-400" title="No OAuth linked">
                        (no identity)
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {user.sessionCount}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <Link
                      to={`/admin/users/${user.id}`}
                      className="font-medium text-amber-600 hover:text-amber-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.users.length === 0 && (
            <div className="py-12 text-center text-gray-500">No users found</div>
          )}

          {data.nextCursor && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isFetching}
                className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
              >
                {isFetching ? 'Loading...' : 'Load more...'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
